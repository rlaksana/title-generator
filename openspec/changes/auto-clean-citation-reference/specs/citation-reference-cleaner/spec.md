## ADDED Requirements

### Requirement: Strip inline numeric citations
The system SHALL remove inline numeric citation markers in bracketed format from text content.

#### Scenario: Single numeric citation
- **WHEN** content contains `...text [1] more text`
- **THEN** output SHALL be `...text more text`

#### Scenario: Multiple sequential citations
- **WHEN** content contains `...text [1][2][3] more text`
- **THEN** output SHALL be `...text more text`

#### Scenario: Sparse citations
- **WHEN** content contains `...text [1] and [2] more text`
- **THEN** output SHALL be `...text and more text`

### Requirement: Strip superscript citations
The system SHALL remove superscript-style citation markers.

#### Scenario: Caret-bracketed superscript citations
- **WHEN** content contains `...text ^[1]^ more text`
- **THEN** output SHALL be `...text more text`

#### Scenario: Multiple superscript citations
- **WHEN** content contains `...text ^[1,2]^ more text`
- **THEN** output SHALL be `...text more text`

### Requirement: Strip parenthetical citations
The system SHALL remove numeric citations in parentheses.

#### Scenario: Single parenthetical citation
- **WHEN** content contains `...text (1) more text`
- **THEN** output SHALL be `...text more text`

#### Scenario: Multiple parenthetical citations
- **WHEN** content contains `...text (1, 2) more text`
- **THEN** output SHALL be `...text more text`

### Requirement: Strip bracketed reference labels
The system SHALL remove bracketed reference labels with alphanumeric content.

#### Scenario: Generic bracketed reference
- **WHEN** content contains `...text [source] more text`
- **THEN** output SHALL be `...text more text`

#### Scenario: Bracketed reference with prefix
- **WHEN** content contains `...text [ref:abc123] more text`
- **THEN** output SHALL be `...text more text`

#### Scenario: Named citations with AI platform prefixes
- **WHEN** content contains `...text [source:1][ref:2][cite:3][note:4] more text`
- **THEN** output SHALL be `...text more text`

#### Scenario: Spaced citations
- **WHEN** content contains `...text [ 1 ] more text`
- **THEN** output SHALL be `...text more text`

### Requirement: Strip URL link citations
The system SHALL remove numeric citations that precede URL links in standard markdown link format.

#### Scenario: Citation before markdown link
- **WHEN** content contains `...text [1][link text](url) more text`
- **THEN** output SHALL be `...text [link text](url) more text`

### Requirement: Strip trailing citation markers
The system SHALL remove citation markers that appear at end of sentences.

#### Scenario: Citation after period
- **WHEN** content contains `...text.[1] more text`
- **THEN** output SHALL be `...text. more text`

### Requirement: Strip reference link definitions
The system SHALL remove markdown reference link definitions that appear at the end of AI responses.

#### Scenario: Reference link definition
- **WHEN** content contains `[1]: https://example.com`
- **THEN** output SHALL not contain this line

#### Scenario: Multiple reference link definitions
- **WHEN** content contains:
```
...text.[1]
[1]: https://example.com
[2]: http://google.com
```
- **THEN** output SHALL be `...text.` with no reference link definitions

### Requirement: Strip reference section headers
The system SHALL remove reference/source section headers added by AI platforms.

#### Scenario: Standard reference headers
- **WHEN** content contains `## References` or `# Citations` or `### Sources`
- **THEN** output SHALL not contain these headers or their content

### Requirement: Settings toggle
The system SHALL respect the `stripCitations` setting to enable or disable citation cleaning.

#### Scenario: Stripping disabled
- **WHEN** `stripCitations` is `false`
- **THEN** content SHALL pass through unchanged

#### Scenario: Stripping enabled
- **WHEN** `stripCitations` is `true`
- **THEN** content SHALL have citation markers removed
