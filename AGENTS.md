## Encoding Rules (Korean Safety)
- Always keep source files (`.js`, `.html`, `.css`, `.md`, `.json`) in UTF-8.
- Do not re-encode text through CP949/ANSI/Latin-1.
- If Korean looks broken in terminal output, treat it as display issue first and verify actual file bytes before editing.
- Do not mass-replace Korean literals when mojibake is only in console rendering.
- In PowerShell writes, use explicit UTF-8 encoding (`Set-Content -Encoding utf8`).
