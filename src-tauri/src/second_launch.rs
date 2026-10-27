//! What a second launch of SahelFlow does. The single-instance plugin hands
//! the second launch to the running copy; that copy must answer with a window.

/// Which windows exist when the second launch arrives.
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub(crate) struct Surfaces {
    /// The workspace window ("main") has been created.
    pub workspace_exists: bool,
    pub workspace_visible: bool,
    pub workspace_minimized: bool,
    /// The native splash is starting or showing.
    pub native_splash_active: bool,
    /// The WebView launch card exists.
    pub startup_card_present: bool,
    /// A normal close or an update has begun stopping the app.
    pub closing: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum Action {
    /// Restore the workspace if it is minimized, show it and focus it.
    ShowWorkspace { restore: bool },
    /// Bring the splash or the launch card forward.
    FocusStartupCard,
    /// There is nothing to show, or showing it would be wrong.
    Nothing,
}

/// The workspace window is hidden on purpose in two ways. During a restart or
/// a shop switch it comes back by itself, so a second launch may show it. During
/// a close or an update it never comes back, so it stays hidden.
pub(crate) fn decide(surfaces: Surfaces) -> Action {
    let restore = surfaces.workspace_minimized;
    if surfaces.workspace_visible {
        return Action::ShowWorkspace { restore };
    }
    if surfaces.native_splash_active || surfaces.startup_card_present {
        return Action::FocusStartupCard;
    }
    if surfaces.workspace_exists && !surfaces.closing {
        return Action::ShowWorkspace { restore };
    }
    Action::Nothing
}

/// Called by the single-instance plugin in the running copy.
pub(crate) fn handle(app: &tauri::AppHandle) {
    use tauri::Manager;
    let workspace = app.get_webview_window("main");
    let surfaces = Surfaces {
        workspace_exists: workspace.is_some(),
        workspace_visible: workspace
            .as_ref()
            .is_some_and(|window| window.is_visible().unwrap_or(false)),
        workspace_minimized: workspace
            .as_ref()
            .is_some_and(|window| window.is_minimized().unwrap_or(false)),
        native_splash_active: crate::native_splash::is_active(),
        startup_card_present: app
            .get_webview_window(crate::launch_screen::LAUNCH_WINDOW_LABEL)
            .is_some(),
        closing: app
            .try_state::<crate::ShutdownCoordinator>()
            .is_some_and(|coordinator| coordinator.has_begun()),
    };
    match decide(surfaces) {
        Action::ShowWorkspace { restore } => {
            if let Some(window) = workspace {
                if restore {
                    let _ = window.unminimize();
                }
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
        Action::FocusStartupCard => crate::launch_screen::focus(app),
        Action::Nothing => {}
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn surfaces(bits: u8) -> Surfaces {
        Surfaces {
            workspace_exists: bits & 1 != 0,
            workspace_visible: bits & 2 != 0,
            workspace_minimized: bits & 4 != 0,
            native_splash_active: bits & 8 != 0,
            startup_card_present: bits & 16 != 0,
            closing: bits & 32 != 0,
        }
    }

    #[test]
    fn a_visible_workspace_is_shown_and_focused_as_before() {
        let visible = Surfaces {
            workspace_exists: true,
            workspace_visible: true,
            ..Surfaces::default()
        };
        assert_eq!(decide(visible), Action::ShowWorkspace { restore: false });
    }

    #[test]
    fn a_minimized_workspace_is_restored_before_it_is_focused() {
        // Tao's set_focus does nothing for a minimized window, so the
        // visible-and-minimized case needs an explicit restore.
        let minimized = Surfaces {
            workspace_exists: true,
            workspace_visible: true,
            workspace_minimized: true,
            ..Surfaces::default()
        };
        assert_eq!(decide(minimized), Action::ShowWorkspace { restore: true });
    }

    #[test]
    fn a_hidden_workspace_with_no_startup_window_is_shown() {
        // Hidden for a runtime restart or a shop switch: show_ready hides the
        // window while the page loads and no launch window exists any more.
        let hidden = Surfaces {
            workspace_exists: true,
            ..Surfaces::default()
        };
        assert_eq!(decide(hidden), Action::ShowWorkspace { restore: false });
    }

    #[test]
    fn a_hidden_and_minimized_workspace_is_shown_and_restored() {
        let hidden = Surfaces {
            workspace_exists: true,
            workspace_minimized: true,
            ..Surfaces::default()
        };
        assert_eq!(decide(hidden), Action::ShowWorkspace { restore: true });
    }

    #[test]
    fn the_startup_card_wins_while_the_workspace_is_not_ready() {
        for (splash, card) in [(true, false), (false, true), (true, true)] {
            let starting = Surfaces {
                workspace_exists: true,
                native_splash_active: splash,
                startup_card_present: card,
                ..Surfaces::default()
            };
            assert_eq!(decide(starting), Action::FocusStartupCard);
        }
    }

    #[test]
    fn the_startup_card_is_focused_even_before_the_workspace_window_exists() {
        let early = Surfaces {
            native_splash_active: true,
            ..Surfaces::default()
        };
        assert_eq!(decide(early), Action::FocusStartupCard);
    }

    #[test]
    fn a_closing_app_never_reveals_the_workspace_it_just_hid() {
        // A normal close and an update hide the workspace so that nothing
        // can write while the shop databases are released.
        let closing = Surfaces {
            workspace_exists: true,
            closing: true,
            ..Surfaces::default()
        };
        assert_eq!(decide(closing), Action::Nothing);
    }

    #[test]
    fn a_closing_app_still_shows_its_startup_card() {
        let closing = Surfaces {
            workspace_exists: true,
            native_splash_active: true,
            closing: true,
            ..Surfaces::default()
        };
        assert_eq!(decide(closing), Action::FocusStartupCard);
    }

    #[test]
    fn with_no_window_at_all_there_is_nothing_to_show() {
        assert_eq!(decide(Surfaces::default()), Action::Nothing);
    }

    #[test]
    fn a_second_launch_gets_a_window_whenever_one_may_be_shown() {
        for bits in 0..64_u8 {
            let state = surfaces(bits);
            let something_exists = state.workspace_exists
                || state.workspace_visible
                || state.native_splash_active
                || state.startup_card_present;
            let startup_window = state.native_splash_active || state.startup_card_present;
            let action = decide(state);
            if state.workspace_visible {
                assert_eq!(
                    action,
                    Action::ShowWorkspace {
                        restore: state.workspace_minimized
                    },
                    "visible workspace: {state:?}"
                );
            } else if startup_window {
                assert_eq!(action, Action::FocusStartupCard, "{state:?}");
            } else if state.closing || !something_exists {
                assert_eq!(action, Action::Nothing, "{state:?}");
            } else {
                assert_eq!(
                    action,
                    Action::ShowWorkspace {
                        restore: state.workspace_minimized
                    },
                    "hidden workspace: {state:?}"
                );
            }
        }
    }
}
