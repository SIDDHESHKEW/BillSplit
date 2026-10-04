# BillSplit

BillSplit is a one-page bill-splitting web application created for **ZeroCode 2026 by Techfest, IIT Bombay**. It helps a group record an occasion, divide an Indian Rupee bill between participants, and verify that the individual shares add up to the exact total.

The project was built for a prompt-engineering competition in which the application had to be developed quickly, remain interactive, and satisfy a mandatory feature checklist using only vanilla web technologies.

## Overview

The application presents a focused two-part workspace:

- A bill-parameters panel for the occasion, bill amount, participant count, and optional tip/GST selections.
- A result panel showing the total, participant count, per-person range where applicable, individual shares, and an exact reconciliation total.

The calculation engine uses integer scaling rather than relying only on ordinary floating-point division. It distributes any remainder across the first few shares and can increase precision to up to six decimal places for very small bills or very large groups.

## Features

### Core Features

- Accepts an occasion name, total bill amount in INR, and number of people.
- Splits the validated amount into equal individual shares.
- Displays every participant's share and the reconciled total.
- Supports participant-count presets for 2, 3, 4, 5, 8, 10, and 1,000 people.
- Lets users rename individual participants directly in the result cards.

### User Experience Features

- Four-second introductory splash screen with a skip action.
- Optional tip selections of 0%, 5%, or 10%.
- Optional GST/service-charge selections of 0%, 5%, or 18%.
- Copyable text summary with a temporary `Copied!` confirmation.
- WhatsApp share action for the generated breakdown.
- Browser print action that is styled as a receipt and can be saved as PDF through the browser.
- Reset action that clears the form, result, and saved state.
- Windowed display and pagination for groups larger than 30 participants.

### Validation and Error Handling

- Required-field validation for all three main inputs.
- Occasion validation for leading spaces, leading zeros, missing letters, and lengths outside 2 to 80 characters.
- Bill validation for spaces, non-numeric characters, leading zeros, zero or negative values, and amounts above ₹100,000,000.
- Participant validation for spaces, decimals, letters, leading zeros, zero, one participant, and counts above 5,000.
- Inline error messages with error styling and focus moved to the first invalid field after submission.
- Live correction of an error while the user edits the affected field.

### Persistence Features

- Calculated state is saved to browser `localStorage`.
- Saved occasion, bill, participant count, add-on percentages, and custom participant names are restored after refresh.
- Saved data is validated before it is used.
- Malformed or invalid saved data is discarded instead of being rendered.
- A temporary saved-status message confirms successful automatic storage.

### Responsive and UI Features

- Desktop layout uses a two-column input/results grid.
- The layout becomes a single column below 960px.
- Result actions, statistics, participant cards, add-on controls, and the splash screen adapt at tablet and mobile breakpoints.
- Participant cards use a responsive grid, then a single column on smaller screens.
- Print styles remove input controls and convert the result view to a plain receipt layout.
- The interface uses visible focus styles, labeled inputs, live error regions, semantic sections, button controls, and `role="list"`/`role="listitem"` for generated shares.

## User Flow

1. The user opens BillSplit and may skip the four-second intro.
2. The user enters an occasion, bill amount, and at least two participants.
3. The user may choose optional tip or GST/service-charge percentages.
4. The user submits the form, or selects a participant preset.
5. The application validates the inputs and focuses the first invalid field when necessary.
6. The application calculates and renders the individual shares.
7. The user can rename participants, copy or share the breakdown, print it, or reset the application.
8. A valid calculated result is restored from browser storage after a page refresh.

## Calculation and Rounding

The submitted bill is normalized to two decimal places before distribution. The calculation then:

1. Selects a precision from two to six decimal places. Standard paise precision is used when it gives every participant at least one unit; higher precision is used for very small per-person shares.
2. Scales the total into integer units at that precision.
3. Divides the integer total into a base share and a remainder.
4. Adds one smallest unit to the first remainder-count participants.
5. Converts the shares back to display values.

This means the sum of all generated shares matches the calculated bill exactly. The result view identifies adjusted shares as “Balanced share” and displays an exact-balancing notice when a remainder is distributed. For large groups, only 30 cards are rendered per page to limit unnecessary DOM work.

## Validation and Edge Cases

The current implementation handles these cases:

| Case | Behavior |
| --- | --- |
| Empty occasion, bill, or participant count | Shows a field-specific error and prevents calculation |
| Occasion without letters or outside 2–80 characters | Rejects the value |
| Bill containing spaces, letters, symbols, leading zeros, zero, or a negative value | Rejects the value |
| Bill above ₹100,000,000 | Rejects the value |
| Zero or one participant | Rejects the value; at least two are required |
| Decimal, spaced, non-numeric, or leading-zero participant count | Rejects the value |
| More than 5,000 participants | Rejects the value to protect browser stability |
| Uneven division | Distributes the smallest-unit remainder across selected shares |
| Very small shares | Uses additional precision, up to six decimal places |
| Invalid saved JSON or invalid saved values | Discards the saved state and starts with the empty view |

## Competition Approach

BillSplit was designed around the ZeroCode evaluation priorities:

- Mandatory functionality was treated as the highest priority.
- Interactivity was implemented before cosmetic improvements.
- Validation and edge cases were considered to reduce execution errors.
- The UI was designed to remain clear and usable under time constraints.
- The solution uses only the technologies permitted by the competition.
- The application is a self-contained browser application for its core calculation and storage behavior.
- Prompt efficiency was an important part of the development strategy.

The development philosophy was:

> Build the required functionality first, make every interaction reliable, then improve visual clarity and creativity.

The repository does not contain a prompt transcript, so this README does not attribute individual implementation details to a particular prompt.

## Technology

- HTML5
- CSS3
- Vanilla JavaScript
- Browser `localStorage` for persistence

The core application runs directly in the browser without a build step. Copying uses the browser clipboard API with a fallback, printing uses the browser print API, and the optional WhatsApp action opens a WhatsApp share URL.

## Design

The visual direction is a dark, high-contrast interface with yellow emphasis:

- A sticky header keeps the BillSplit identity, INR indicator, and reset action available.
- Input and result areas are organized into rounded cards with consistent spacing and clear section headings.
- Yellow is reserved for primary actions, active controls, calculated amounts, and precision cues.
- Green is used for saved-state confirmation and exact reconciliation.
- Error messages use red field borders and inline text.
- The result summary puts the occasion, total, participant count, and per-person amount before the individual share cards.
- CSS media queries at 960px, 768px, 640px, 480px, and 340px progressively simplify the layout for smaller screens.
- A print stylesheet removes interactive controls and presents the result on a white, border-based receipt layout.

## Project Structure

```text
/
├── index.html
├── style.css
├── script.js
└── README.md
```

| File | Responsibility |
| --- | --- |
| `index.html` | Defines the splash screen, form, optional add-ons, result areas, action buttons, attribution, and semantic/accessibility attributes. |
| `style.css` | Defines color tokens, layout, cards, controls, validation states, animations, responsive breakpoints, and print styles. |
| `script.js` | Validates input, calculates exact shares, renders results, handles actions, manages pagination and renaming, and saves/restores state. |
| `README.md` | Documents the implemented application and its competition context. |

## Running the Project

No package installation or build command is required. Open `index.html` in a modern browser, or serve the folder with any simple static file server if the browser environment restricts local-file behavior. The project uses root-relative asset paths, so serving it from the site root is the most reliable option.

## Testing

The application can be tested manually with the following scenarios:

1. Enter a valid occasion, bill, and participant count, then confirm the calculated result.
2. Try several participant counts and use the preset buttons.
3. Test an uneven division such as ₹100 between 3 people and confirm the reconciliation notice and exact total.
4. Test empty values, letters, spaces, zero, negative values, decimals for people, leading zeros, and values beyond the documented limits.
5. Select tip or GST options and confirm that the displayed grand total and shares update.
6. Rename a participant, refresh the page, and confirm that the result and name are restored.
7. Test copy, WhatsApp, print, and reset actions in a browser with the relevant permissions or applications available.
8. Test a group larger than 30 to verify pagination, then test up to the 5,000-person limit.
9. Resize the browser to desktop, tablet, and mobile widths and check that controls and results remain readable.
10. Perform repeated calculations to confirm that the previous result is replaced and the new state is saved.

## Limitations

- The splitter distributes the bill evenly; it does not support different amounts, weights, or item-level assignments.
- Participant names are generated as `Person 1`, `Person 2`, and so on, then renamed individually after calculation.
- Persistence is limited to the browser's local storage on the current device and browser profile.
- Copy and print behavior depends on browser permissions and support.
- The optional WhatsApp action hands the generated text to WhatsApp through a share URL and therefore depends on the user's browser/network and WhatsApp availability.
- The application is intentionally a static client-side project with no account system or shared remote workspace.

## Learning and Takeaways

This project demonstrates:

- Prompt engineering and rapid frontend development in a constrained competition setting.
- Translating a problem statement into concrete software requirements.
- Input validation and deliberate edge-case handling.
- Exact client-side calculation and state management.
- Browser-based persistence with `localStorage`.
- Responsive UI design using HTML and CSS alone.
- Designing useful feedback for invalid input and rounding situations.
- Building a complete interactive application within strict time and technology constraints.

## Conclusion

BillSplit demonstrates how a clearly defined problem can be transformed into a functional, interactive web application using prompt-driven development under the constraints of the ZeroCode competition. Its focus is practical: complete the required bill-splitting workflow, keep calculations reliable, preserve useful state, and present the result clearly across screen sizes.#   B i l l S p l i t  
 