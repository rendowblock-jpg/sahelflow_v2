//! How often the desktop shell tells the workspace window about the progress of
//! an update download.
//!
//! The updater plugin reports one message per network chunk, and Tauri turns each
//! message into a separate script run inside the window. A 106 MB installer
//! arrives in thousands of chunks (the chunk size is whatever the TLS stream hands
//! over, usually 8 to 16 KB), so the window was asked to run thousands of scripts
//! in a few minutes. On a slow PC that starved the page: the update chip counted
//! up while every other page stopped loading. The shell now counts the bytes
//! itself and lets the window know a few times a second.
//!
//! Nothing here touches Tauri, the network or the clock: the caller passes the
//! time, so the rules are plain functions that the unit tests below can drive.

use std::time::{Duration, Instant};

/// The window hears about progress at most this often (four times a second is
/// plenty for a bar that moves one percent at a time).
pub(crate) const MIN_REPORT_INTERVAL: Duration = Duration::from_millis(250);

/// What the window is told: bytes received so far and, when the server said so,
/// the size of the whole file.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct ProgressReport {
    pub(crate) downloaded: u64,
    pub(crate) total: Option<u64>,
}

#[derive(Debug, Default)]
pub(crate) struct ProgressThrottle {
    downloaded: u64,
    last_reported_at: Option<Instant>,
}

impl ProgressThrottle {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// One more chunk arrived. Returns a report only when the window should hear
    /// about it: the very first chunk (so it learns the total at once), then at
    /// most one report per `MIN_REPORT_INTERVAL`.
    pub(crate) fn record(
        &mut self,
        chunk_length: usize,
        total: Option<u64>,
        now: Instant,
    ) -> Option<ProgressReport> {
        self.downloaded = self.downloaded.saturating_add(chunk_length as u64);
        let due = match self.last_reported_at {
            None => true,
            // A clock that went backwards is not "due": it never floods.
            Some(last) => now
                .checked_duration_since(last)
                .is_some_and(|gap| gap >= MIN_REPORT_INTERVAL),
        };
        if !due {
            return None;
        }
        self.last_reported_at = Some(now);
        Some(ProgressReport {
            downloaded: self.downloaded,
            total,
        })
    }

    /// The figure to send when the download has ended, whatever the clock says.
    pub(crate) fn finish(&self, total: Option<u64>) -> ProgressReport {
        ProgressReport {
            downloaded: self.downloaded,
            total,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(start: Instant, milliseconds: u64) -> Instant {
        start + Duration::from_millis(milliseconds)
    }

    #[test]
    fn the_first_chunk_is_reported_at_once_with_the_total() {
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new();
        let report = throttle.record(16_384, Some(106_700_182), start);
        assert_eq!(
            report,
            Some(ProgressReport {
                downloaded: 16_384,
                total: Some(106_700_182)
            })
        );
    }

    #[test]
    fn chunks_inside_the_interval_are_counted_but_not_reported() {
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new();
        assert!(throttle.record(1_000, Some(10_000), start).is_some());
        assert_eq!(throttle.record(1_000, Some(10_000), at(start, 10)), None);
        assert_eq!(throttle.record(1_000, Some(10_000), at(start, 249)), None);
        // The count kept running while nothing was reported.
        let report = throttle.record(1_000, Some(10_000), at(start, 250));
        assert_eq!(
            report,
            Some(ProgressReport {
                downloaded: 4_000,
                total: Some(10_000)
            })
        );
    }

    #[test]
    fn thousands_of_chunks_make_a_handful_of_reports() {
        // 106,700,182 bytes in 8 KB chunks is 13,025 chunks. At 100 Mbit/s they
        // arrive in about 9 seconds, at 2 Mbit/s in about 7 minutes. Either way
        // the window must hear a few times a second, not 13,025 times.
        for (label, chunk_gap_micros) in [("fast line", 700_u64), ("slow line", 32_000_u64)] {
            let start = Instant::now();
            let mut throttle = ProgressThrottle::new();
            let total = 106_700_182_u64;
            let chunk = 8_192_usize;
            let chunks = (total as usize).div_ceil(chunk);
            let mut reports = 0_u32;
            for index in 0..chunks {
                let now = start + Duration::from_micros(index as u64 * chunk_gap_micros);
                if throttle.record(chunk, Some(total), now).is_some() {
                    reports += 1;
                }
            }
            let seconds = (chunks as u64 * chunk_gap_micros) as f64 / 1_000_000.0;
            let ceiling = (seconds * 4.0).ceil() as u32 + 2;
            assert!(
                reports <= ceiling,
                "{label}: {reports} reports for {chunks} chunks over {seconds:.1}s (ceiling {ceiling})"
            );
            assert!(reports >= 2, "{label}: the window must hear more than once");
        }
    }

    #[test]
    fn finish_reports_every_byte_whatever_the_clock_said() {
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new();
        throttle.record(5_000, Some(12_000), start);
        throttle.record(7_000, Some(12_000), at(start, 5));
        assert_eq!(
            throttle.finish(Some(12_000)),
            ProgressReport {
                downloaded: 12_000,
                total: Some(12_000)
            }
        );
    }

    #[test]
    fn an_unknown_total_stays_unknown() {
        let start = Instant::now();
        let mut throttle = ProgressThrottle::new();
        let report = throttle.record(2_048, None, start).expect("first chunk");
        assert_eq!(report.total, None);
        assert_eq!(throttle.finish(None).total, None);
    }

    #[test]
    fn a_clock_that_goes_backwards_does_not_flood_or_panic() {
        let start = Instant::now() + Duration::from_secs(5);
        let mut throttle = ProgressThrottle::new();
        assert!(throttle.record(1_000, Some(9_000), start).is_some());
        let earlier = start - Duration::from_secs(5);
        assert_eq!(throttle.record(1_000, Some(9_000), earlier), None);
    }
}
