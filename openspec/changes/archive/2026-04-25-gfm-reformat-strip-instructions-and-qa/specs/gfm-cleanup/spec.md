## ADDED Requirements

### Requirement: Strip leaked instructions from AI output
The system SHALL remove instruction-like content that leaked into the reformatted output during the AI reformatting process.

#### Scenario: Instruction prompt leaked into output
- **WHEN** AI output contains lines that match common instruction patterns (e.g., "Instructions:", "Format the following", "You are a helpful assistant")
- **THEN** system SHALL remove those lines from the reformatted content

#### Scenario: Prompt fragments duplicated in output
- **WHEN** the same text appears both in the input prompt and in the AI output
- **THEN** system SHALL remove the duplicate prompt text from the output

### Requirement: Strip Q&A prefix from AI output
The system SHALL remove question lines that appear before answer content in AI output, keeping only the answer portion.

#### Scenario: Q&A format at start of content
- **WHEN** content starts with lines matching "Q:" or "Question:" pattern followed by "A:" or "Answer:" pattern
- **THEN** system SHALL remove the question lines and any blank lines between question and answer, preserving only the answer content

#### Scenario: Multiple questions before single answer
- **WHEN** content starts with multiple consecutive question lines followed by answer
- **THEN** system SHALL remove all question lines, keeping only the answer that follows

### Requirement: Cleanup runs as part of postTransform
The cleanup operations SHALL run automatically as part of the existing GFM post-processing pipeline, requiring no additional user action.

#### Scenario: Cleanup integrated into existing flow
- **WHEN** GFM reformatting is enabled and user triggers reformat
- **THEN** system SHALL run instruction stripping and Q&A prefix removal as part of the postTransform step
- **AND** no additional user configuration SHALL be required
