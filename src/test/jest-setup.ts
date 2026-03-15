// Ensure ANSI color codes are produced in non-TTY test environments.
// marked-terminal uses a bundled chalk that checks FORCE_COLOR at load time.
process.env.FORCE_COLOR = process.env.FORCE_COLOR || "1";
