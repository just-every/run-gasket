-- Display preferences confer no identity, record access or delivery authority.
CREATE TABLE gk_language_settings (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  locale TEXT NOT NULL CHECK(locale IN ('en-US','es-US'))
);
INSERT INTO gk_language_settings VALUES(1,'en-US');
CREATE TABLE gk_member_languages (
  member_id TEXT PRIMARY KEY REFERENCES gk_members(id),
  locale TEXT NOT NULL CHECK(locale IN ('en-US','es-US'))
);
CREATE TABLE gk_intake_translations (
  locale TEXT NOT NULL CHECK(locale='es-US'),
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY(locale,key)
);
