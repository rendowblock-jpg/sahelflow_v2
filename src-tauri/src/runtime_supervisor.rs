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
    runtime_ready: bool,
    shutting_down: bool,
    safe_mode: bool,
}

impl RuntimeSupervisor {
    pub fn register_ready(&mut self) -> Result<(), &'static str> {
        if self.shutting_down {
            return Err("runtime shutdown is already in progress");
        }
        if self.safe_mode {
            return Err("runtime supervisor is in crash-loop safe mode");
        }
        self.runtime_ready = true;
        Ok(())
    }

    pub fn record_termination(&mut self, uptime: Duration) -> RestartDecision {
        self.runtime_ready = false;
        if self.shutting_down || self.safe_mode {
            return RestartDecision::Ignore;
        }
        if uptime >= STABLE_RUNTIME_THRESHOLD {
            self.restart_attempts = 0;
        }
        self.next_restart()
    }

    pub fn record_restart_failure(&mut self) -> RestartDecision {
        self.runtime_ready = false;
        if self.shutting_down || self.safe_mode {
            return RestartDecision::Ignore;
        }
        self.next_restart()
    }

    pub fn begin_shutdown(&mut self) {
        self.shutting_down = true;
        self.runtime_ready = false;
    }

    pub fn runtime_ready(&self) -> bool {
        self.runtime_ready
    }

    pub fn allows_restart(&self) -> bool {
        !self.shutting_down && !self.safe_mode
    }

    fn next_restart(&mut self) -> RestartDecision {
        self.restart_attempts = self.restart_attempts.saturating_add(1);
        if self.restart_attempts > MAX_RESTART_ATTEMPTS {
            self.safe_mode = true;
            return RestartDecision::EnterSafeMode {
                attempts: MAX_RESTART_ATTEMPTS,
            };
        }
        let delay = match self.restart_attempts {
            1 => Duration::from_secs(2),
            2 => Duration::from_secs(5),
            _ => Duration::from_secs(15),
        };
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
        supervisor.register_ready().expect("register ready runtime");

        assert_eq!(
            supervisor.record_termination(Duration::from_secs(10)),
            RestartDecision::Retry {
                attempt: 1,
                delay: Duration::from_secs(2),
            }
        );
        assert_eq!(
            supervisor.record_restart_failure(),
            RestartDecision::Retry {
                attempt: 2,
                delay: Duration::from_secs(5),
            }
        );
        assert_eq!(
            supervisor.record_restart_failure(),
            RestartDecision::Retry {
                attempt: 3,
                delay: Duration::from_secs(15),
            }
        );
        assert_eq!(
            supervisor.record_restart_failure(),
            RestartDecision::EnterSafeMode { attempts: 3 }
        );
        assert!(!supervisor.allows_restart());
        assert!(supervisor.register_ready().is_err());
    }

    #[test]
    fn stable_runtime_resets_the_restart_budget() {
        let mut supervisor = RuntimeSupervisor::default();
        supervisor.register_ready().expect("register ready runtime");
        assert!(matches!(
            supervisor.record_termination(Duration::from_secs(5)),
            RestartDecision::Retry { attempt: 1, .. }
        ));
        supervisor
            .register_ready()
            .expect("register restarted runtime");

        assert!(matches!(
            supervisor.record_termination(Duration::from_secs(60)),
            RestartDecision::Retry { attempt: 1, .. }
        ));
    }

    #[test]
    fn shutdown_suppresses_restart_and_future_child_registration() {
        let mut supervisor = RuntimeSupervisor::default();
        supervisor.register_ready().expect("register ready runtime");
        supervisor.begin_shutdown();

        assert!(supervisor.shutting_down);
        assert!(!supervisor.runtime_ready());
        assert!(!supervisor.allows_restart());
        assert_eq!(
            supervisor.record_termination(Duration::from_secs(1)),
            RestartDecision::Ignore
        );
        assert!(supervisor.register_ready().is_err());
    }
}
