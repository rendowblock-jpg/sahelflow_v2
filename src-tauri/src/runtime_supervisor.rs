use std::time::Duration;

const MAX_RESTART_ATTEMPTS: u8 = 3;
const STABLE_RUNTIME_THRESHOLD: Duration = Duration::from_secs(60);

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RestartDecision {
    Ignore,
    Retry { attempt: u8, delay: Duration },
    EnterSafeMode { attempts: u8 },
}

#[derive(Debug, Default)]
pub struct RuntimeSupervisor {
    restart_attempts: u8,
    generation: u64,
    generation_starting: bool,
    generation_failure_recorded: bool,
    pending_restart_attempt: Option<u8>,
    runtime_ready: bool,
    shutting_down: bool,
    safe_mode: bool,
}

impl RuntimeSupervisor {
    pub fn begin_generation(&mut self) -> Result<u64, &'static str> {
        if self.pending_restart_attempt.is_some() {
            return Err("an automatic runtime restart is pending");
        }
        self.start_generation()
    }

    pub fn begin_restart_generation(
        &mut self,
        expected_generation: u64,
        attempt: u8,
    ) -> Result<u64, &'static str> {
        if !self.generation_can_restart(expected_generation, attempt) {
            return Err("automatic runtime restart permit is stale or unavailable");
        }
        self.pending_restart_attempt = None;
        self.start_generation()
    }

    fn start_generation(&mut self) -> Result<u64, &'static str> {
        if self.shutting_down {
            return Err("runtime shutdown is already in progress");
        }
        if self.safe_mode {
            return Err("runtime supervisor is in crash-loop safe mode");
        }
        if self.generation_starting || self.runtime_ready {
            return Err("a runtime generation is already starting or ready");
        }
        self.generation = self
            .generation
            .checked_add(1)
            .ok_or("runtime generation counter is exhausted")?;
        self.generation_starting = true;
        self.generation_failure_recorded = false;
        Ok(self.generation)
    }

    pub fn cancel_generation(&mut self, generation: u64) -> bool {
        if generation != self.generation || !self.generation_starting {
            return false;
        }
        self.generation_starting = false;
        self.runtime_ready = false;
        self.pending_restart_attempt = None;
        true
    }

    pub fn register_ready(&mut self, generation: u64) -> Result<(), &'static str> {
        if generation != self.generation || !self.generation_starting {
            return Err("runtime generation is stale or was not starting");
        }
        if self.shutting_down {
            return Err("runtime shutdown is already in progress");
        }
        if self.safe_mode {
            return Err("runtime supervisor is in crash-loop safe mode");
        }
        self.generation_starting = false;
        self.runtime_ready = true;
        Ok(())
    }

    pub fn record_termination(&mut self, generation: u64, uptime: Duration) -> RestartDecision {
        if generation != self.generation || !self.runtime_ready || self.generation_failure_recorded
        {
            return RestartDecision::Ignore;
        }
        self.generation_starting = false;
        self.generation_failure_recorded = true;
        self.runtime_ready = false;
        if self.shutting_down || self.safe_mode {
            return RestartDecision::Ignore;
        }
        if uptime >= STABLE_RUNTIME_THRESHOLD {
            self.restart_attempts = 0;
        }
        self.next_restart()
    }

    pub fn record_restart_failure(&mut self, generation: u64) -> RestartDecision {
        if generation != self.generation || self.generation_failure_recorded {
            return RestartDecision::Ignore;
        }
        self.generation_starting = false;
        self.generation_failure_recorded = true;
        self.runtime_ready = false;
        if self.shutting_down || self.safe_mode {
            return RestartDecision::Ignore;
        }
        self.next_restart()
    }

    pub fn begin_shutdown(&mut self) {
        self.shutting_down = true;
        self.generation_starting = false;
        self.pending_restart_attempt = None;
        self.runtime_ready = false;
    }

    pub fn enter_safe_mode(&mut self, generation: u64) -> bool {
        if generation != self.generation || self.shutting_down {
            return false;
        }
        self.generation_starting = false;
        self.generation_failure_recorded = true;
        self.pending_restart_attempt = None;
        self.runtime_ready = false;
        self.safe_mode = true;
        true
    }

    pub fn runtime_ready(&self) -> bool {
        self.runtime_ready
    }

    pub fn allows_restart(&self) -> bool {
        !self.shutting_down && !self.safe_mode
    }

    pub fn in_safe_mode(&self) -> bool {
        self.safe_mode
    }

    pub fn current_generation(&self) -> u64 {
        self.generation
    }

    pub fn generation_can_restart(&self, generation: u64, attempt: u8) -> bool {
        generation == self.generation
            && self.pending_restart_attempt == Some(attempt)
            && !self.generation_starting
            && !self.runtime_ready
            && self.allows_restart()
    }

    fn next_restart(&mut self) -> RestartDecision {
        if self.restart_attempts >= MAX_RESTART_ATTEMPTS {
            self.safe_mode = true;
            self.pending_restart_attempt = None;
            return RestartDecision::EnterSafeMode {
                attempts: MAX_RESTART_ATTEMPTS,
            };
        }
        self.restart_attempts += 1;
        let delay = match self.restart_attempts {
            1 => Duration::from_secs(2),
            2 => Duration::from_secs(5),
            _ => Duration::from_secs(15),
        };
        self.pending_restart_attempt = Some(self.restart_attempts);
        RestartDecision::Retry {
            attempt: self.restart_attempts,
            delay,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn crash_and_restart_failures_share_one_bounded_budget() {
        let mut supervisor = RuntimeSupervisor::default();
        let generation = supervisor.begin_generation().expect("begin runtime");
        supervisor
            .register_ready(generation)
            .expect("register ready runtime");

        assert_eq!(
            supervisor.record_termination(generation, Duration::from_secs(10)),
            RestartDecision::Retry {
                attempt: 1,
                delay: Duration::from_secs(2),
            }
        );
        assert!(supervisor.generation_can_restart(generation, 1));
        let second = supervisor
            .begin_restart_generation(generation, 1)
            .expect("begin first automatic launch");
        assert_eq!(
            supervisor.record_restart_failure(second),
            RestartDecision::Retry {
                attempt: 2,
                delay: Duration::from_secs(5),
            }
        );
        let third = supervisor
            .begin_restart_generation(second, 2)
            .expect("begin second automatic launch");
        assert_eq!(
            supervisor.record_restart_failure(third),
            RestartDecision::Retry {
                attempt: 3,
                delay: Duration::from_secs(15),
            }
        );
        let fourth = supervisor
            .begin_restart_generation(third, 3)
            .expect("begin third automatic launch");
        assert_eq!(
            supervisor.record_restart_failure(fourth),
            RestartDecision::EnterSafeMode { attempts: 3 }
        );
        assert!(!supervisor.allows_restart());
        assert!(supervisor.begin_generation().is_err());
        assert!(supervisor.begin_restart_generation(fourth, 3).is_err());
    }

    #[test]
    fn stable_runtime_resets_the_restart_budget() {
        let mut supervisor = RuntimeSupervisor::default();
        let first = supervisor.begin_generation().expect("begin first runtime");
        supervisor
            .register_ready(first)
            .expect("register ready runtime");
        assert!(matches!(
            supervisor.record_termination(first, Duration::from_secs(5)),
            RestartDecision::Retry { attempt: 1, .. }
        ));
        let second = supervisor
            .begin_restart_generation(first, 1)
            .expect("begin restarted runtime");
        supervisor
            .register_ready(second)
            .expect("register restarted runtime");

        assert!(matches!(
            supervisor.record_termination(second, Duration::from_secs(60)),
            RestartDecision::Retry { attempt: 1, .. }
        ));
    }

    #[test]
    fn shutdown_suppresses_restart_and_future_child_registration() {
        let mut supervisor = RuntimeSupervisor::default();
        let generation = supervisor.begin_generation().expect("begin runtime");
        supervisor
            .register_ready(generation)
            .expect("register ready runtime");
        supervisor.begin_shutdown();

        assert!(supervisor.shutting_down);
        assert!(!supervisor.runtime_ready());
        assert!(!supervisor.allows_restart());
        assert_eq!(
            supervisor.record_termination(generation, Duration::from_secs(1)),
            RestartDecision::Ignore
        );
        assert!(supervisor.begin_generation().is_err());
    }

    #[test]
    fn stale_delayed_generation_cannot_restart_or_become_ready() {
        let mut supervisor = RuntimeSupervisor::default();
        let first = supervisor.begin_generation().expect("begin first runtime");
        assert!(supervisor.cancel_generation(first));
        assert!(!supervisor.generation_can_restart(first, 1));

        let second = supervisor.begin_generation().expect("begin second runtime");
        assert!(!supervisor.generation_can_restart(first, 1));
        assert!(supervisor.register_ready(first).is_err());
        supervisor
            .register_ready(second)
            .expect("register current runtime");
    }

    #[test]
    fn ready_restart_navigation_failure_consumes_the_shared_budget() {
        let mut supervisor = RuntimeSupervisor::default();
        let first = supervisor.begin_generation().expect("begin first runtime");
        supervisor
            .register_ready(first)
            .expect("register first runtime");
        assert!(matches!(
            supervisor.record_termination(first, Duration::from_secs(5)),
            RestartDecision::Retry { attempt: 1, .. }
        ));

        let restarted = supervisor
            .begin_restart_generation(first, 1)
            .expect("begin automatic restart");
        supervisor
            .register_ready(restarted)
            .expect("restart reached readiness");
        assert_eq!(
            supervisor.record_restart_failure(restarted),
            RestartDecision::Retry {
                attempt: 2,
                delay: Duration::from_secs(5),
            }
        );
        assert!(!supervisor.runtime_ready());
    }

    #[test]
    fn one_generation_failure_is_counted_only_once() {
        let mut supervisor = RuntimeSupervisor::default();
        let generation = supervisor.begin_generation().expect("begin runtime");
        supervisor
            .register_ready(generation)
            .expect("register ready runtime");

        assert!(matches!(
            supervisor.record_termination(generation, Duration::from_secs(5)),
            RestartDecision::Retry { attempt: 1, .. }
        ));
        assert_eq!(
            supervisor.record_restart_failure(generation),
            RestartDecision::Ignore
        );
        assert_eq!(
            supervisor.record_termination(generation, Duration::from_secs(5)),
            RestartDecision::Ignore
        );

        let next = supervisor
            .begin_restart_generation(generation, 1)
            .expect("begin next runtime");
        assert_eq!(
            supervisor.record_restart_failure(next),
            RestartDecision::Retry {
                attempt: 2,
                delay: Duration::from_secs(5),
            }
        );
    }
}
