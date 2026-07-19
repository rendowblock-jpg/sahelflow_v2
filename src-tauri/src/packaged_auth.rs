use rusqlite::Connection;
use std::io::{Error as IoError, ErrorKind};
use std::path::Path;

const CANONICAL_AUTH_ID: &str = "default";
const LEGACY_AUTH_SECRET_KEY: &str = "auth_secret";
const LEGACY_AUTH_PIN_KEY: &str = "auth_pin_hash";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AuthMode {
    Setup,
    Configured,
}

impl AuthMode {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Setup => "setup",
            Self::Configured => "configured",
        }
    }
}

/// Auth authority loaded from the exact active shop database. The secret is
/// intentionally private and this type does not implement Debug.
pub struct PackagedAuth {
    mode: AuthMode,
    secret: Option<String>,
}

impl PackagedAuth {
    pub fn mode(&self) -> AuthMode {
        self.mode
    }

    pub fn secret(&self) -> Option<&str> {
        self.secret.as_deref()
    }
}

pub fn load(database_path: &Path) -> Result<PackagedAuth, Box<dyn std::error::Error>> {
    let connection = Connection::open_with_flags(
        database_path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )?;

    let mut canonical_statement =
        connection.prepare(r#"SELECT "id", "pinHash", "secret" FROM "AuthSecret""#)?;
    let canonical_rows = canonical_statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    if !canonical_rows.is_empty() {
        if canonical_rows.len() != 1 {
            return Err(invalid_auth_state(
                "the canonical AuthSecret singleton contains unexpected rows",
            ));
        }
        let (id, pin_hash, secret) = &canonical_rows[0];
        if id != CANONICAL_AUTH_ID || pin_hash.trim().is_empty() || secret.trim().is_empty() {
            return Err(invalid_auth_state(
                "the canonical AuthSecret row is incomplete or invalid",
            ));
        }
        return Ok(PackagedAuth {
            mode: AuthMode::Configured,
            secret: Some(secret.clone()),
        });
    }

    // The Setting fallback exists only for databases upgrading from the old
    // auth layout. Both legacy values must be present; partial state is not a
    // fresh setup and must fail closed.
    let mut legacy_statement = connection.prepare(
        r#"SELECT "key", "value" FROM "Setting"
           WHERE "key" IN ('auth_secret', 'auth_pin_hash')"#,
    )?;
    let legacy_rows = legacy_statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let legacy_secret = legacy_rows
        .iter()
        .find_map(|(key, value)| (key == LEGACY_AUTH_SECRET_KEY).then_some(value));
    let legacy_pin = legacy_rows
        .iter()
        .find_map(|(key, value)| (key == LEGACY_AUTH_PIN_KEY).then_some(value));

    match (legacy_secret, legacy_pin) {
        (None, None) => Ok(PackagedAuth {
            mode: AuthMode::Setup,
            secret: None,
        }),
        (Some(secret), Some(pin_hash))
            if !secret.trim().is_empty() && !pin_hash.trim().is_empty() =>
        {
            Ok(PackagedAuth {
                mode: AuthMode::Configured,
                secret: Some(secret.clone()),
            })
        }
        _ => Err(invalid_auth_state(
            "the legacy auth upgrade state is incomplete or invalid",
        )),
    }
}

fn invalid_auth_state(message: &'static str) -> Box<dyn std::error::Error> {
    IoError::new(ErrorKind::InvalidData, message).into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn database_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "sahelflow-packaged-auth-{name}-{}-{}.db",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ))
    }

    fn create_auth_schema(path: &Path) -> Connection {
        let connection = Connection::open(path).expect("open test database");
        connection
            .execute_batch(
                r#"
                CREATE TABLE "AuthSecret" (
                    "id" TEXT NOT NULL PRIMARY KEY,
                    "pinHash" TEXT NOT NULL,
                    "secret" TEXT NOT NULL
                );
                CREATE TABLE "Setting" (
                    "key" TEXT NOT NULL PRIMARY KEY,
                    "value" TEXT NOT NULL
                );
                "#,
            )
            .expect("create auth schema");
        connection
    }

    #[test]
    fn configured_secret_is_reloaded_from_the_database_on_restart() {
        let path = database_path("restart");
        let connection = create_auth_schema(&path);
        connection
            .execute(
                r#"INSERT INTO "AuthSecret" ("id", "pinHash", "secret") VALUES ('default', 'pin-hash', 'first-secret')"#,
                [],
            )
            .expect("insert canonical auth");
        drop(connection);

        let first = load(&path).expect("load first launch auth");
        assert_eq!(first.mode(), AuthMode::Configured);
        assert_eq!(first.secret(), Some("first-secret"));

        let connection = Connection::open(&path).expect("reopen test database");
        connection
            .execute(
                r#"UPDATE "AuthSecret" SET "secret" = 'restart-secret' WHERE "id" = 'default'"#,
                [],
            )
            .expect("rotate canonical auth");
        drop(connection);

        let restarted = load(&path).expect("reload restart auth");
        assert_eq!(restarted.mode(), AuthMode::Configured);
        assert_eq!(restarted.secret(), Some("restart-secret"));
        fs::remove_file(path).expect("remove test database");
    }

    #[test]
    fn empty_canonical_and_legacy_auth_is_genuine_setup() {
        let path = database_path("setup");
        drop(create_auth_schema(&path));

        let auth = load(&path).expect("load setup auth");
        assert_eq!(auth.mode(), AuthMode::Setup);
        assert_eq!(auth.secret(), None);
        fs::remove_file(path).expect("remove test database");
    }

    #[test]
    fn complete_legacy_auth_is_the_only_upgrade_fallback() {
        let path = database_path("legacy");
        let connection = create_auth_schema(&path);
        connection
            .execute_batch(
                r#"
                INSERT INTO "Setting" ("key", "value") VALUES ('auth_secret', 'legacy-secret');
                INSERT INTO "Setting" ("key", "value") VALUES ('auth_pin_hash', 'legacy-pin-hash');
                "#,
            )
            .expect("insert legacy auth");
        drop(connection);

        let auth = load(&path).expect("load legacy auth");
        assert_eq!(auth.mode(), AuthMode::Configured);
        assert_eq!(auth.secret(), Some("legacy-secret"));
        fs::remove_file(path).expect("remove test database");
    }

    #[test]
    fn missing_secret_or_unqueryable_schema_blocks_startup() {
        let missing_secret_path = database_path("missing-secret");
        let connection = create_auth_schema(&missing_secret_path);
        connection
            .execute(
                r#"INSERT INTO "AuthSecret" ("id", "pinHash", "secret") VALUES ('default', 'pin-hash', '')"#,
                [],
            )
            .expect("insert incomplete canonical auth");
        drop(connection);
        assert!(load(&missing_secret_path).is_err());
        fs::remove_file(missing_secret_path).expect("remove incomplete database");

        let invalid_schema_path = database_path("invalid-schema");
        drop(Connection::open(&invalid_schema_path).expect("create empty database"));
        assert!(load(&invalid_schema_path).is_err());
        fs::remove_file(invalid_schema_path).expect("remove invalid database");
    }
}
