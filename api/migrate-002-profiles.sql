-- Profiles: a bio, a sigil (icon on a colour), a banner, and privacy choices.
ALTER TABLE users ADD COLUMN bio TEXT;
ALTER TABLE users ADD COLUMN sigil TEXT;
ALTER TABLE users ADD COLUMN banner TEXT;
ALTER TABLE users ADD COLUMN privacy TEXT;
