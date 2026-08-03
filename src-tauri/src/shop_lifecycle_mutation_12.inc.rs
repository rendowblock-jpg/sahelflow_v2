impl fmt::Display for MutationAuthorityError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Command(error) => write!(formatter, "shop lifecycle command rejected: {error}"),
            Self::Io(error) => write!(formatter, "shop lifecycle I/O failed: {error}"),
            Self::Json(error) => write!(formatter, "shop lifecycle JSON is invalid: {error}"),
            Self::Sqlite(error) => write!(formatter, "shop lifecycle SQLite failed: {error}"),
            Self::UnsupportedOperation => write!(
                formatter,
                "native mutation authority does not accept switch operations"
            ),
            Self::AuthorityMismatch(message) => {
                write!(formatter, "shop lifecycle authority mismatch: {message}")
            }
            Self::InvalidRegistry(message) => write!(formatter, "shop registry rejected: {message}"),
            Self::InvalidState(message) => write!(formatter, "shop lifecycle state rejected: {message}"),
            Self::IncompleteJournal(message) => write!(
                formatter,
                "an incomplete shop lifecycle journal blocks the operation: {message}"
            ),
            Self::Busy(message) => write!(formatter, "shop lifecycle authority is busy: {message}"),
            Self::Entitlement(message) => write!(formatter, "shop entitlement rejected: {message}"),
            Self::Archive(message) => write!(formatter, "shop archive rejected: {message}"),
            Self::Migration(message) => write!(formatter, "shop provisioning rejected: {message}"),
            Self::ManualRecoveryRequired(message) => write!(
                formatter,
                "manual shop lifecycle recovery is required: {message}"
            ),
        }
    }
}

impl std::error::Error for MutationAuthorityError {}

impl From<ShopLifecycleCommandError> for MutationAuthorityError {
    fn from(value: ShopLifecycleCommandError) -> Self {
        Self::Command(value)
    }
}

impl From<IoError> for MutationAuthorityError {
    fn from(value: IoError) -> Self {
        Self::Io(value)
    }
}

impl From<serde_json::Error> for MutationAuthorityError {
    fn from(value: serde_json::Error) -> Self {
        Self::Json(value)
    }
}

impl From<rusqlite::Error> for MutationAuthorityError {
    fn from(value: rusqlite::Error) -> Self {
        Self::Sqlite(value)
    }
}
