# Component Guidance

## Scope
- Components are client-heavy React/TypeScript views styled with Tailwind.
- Large game files own significant local state. Read targeted ranges with `rg` before opening an entire file.

## Ownership
- `ability-blitz.tsx`: Ability Blitz gameplay, difficulty, modifiers, progress, and animations.
- `difficulty-style.tsx`: authoritative cross-game difficulty labels, tier colors, and selected-state styling.
- `game-settings-section.tsx`: shared collapsible section for multiplayer lobby settings.
- `skin-champion.tsx`: Skin Champion gameplay and skin-image behavior.
- `skindle.tsx`: Daily Skindle guesses, reveal flow, and global statistics UI.
- `skincognito.tsx`: Multiplayer lobby/game UI, Realtime refreshes, chat, and lifecycle requests.
- `multiplayer-quiz-lobby.tsx`: Shared pre-game lobby for multiplayer Ability Blitz and Skin Champion.
- `multiplayer-lobby-roster.tsx`: Shared lobby roster, social context menu, and host management controls for multiplayer games.
- `multiplayer-game-progress.tsx`: Shared live race standings and multiplayer game runtime contract.
- `profile-screen.tsx` and `public-profile-screen.tsx`: owner/public profile presentations.
- `friends-widget.tsx`: friend list, direct messages, presence, and game invites.
- `global-actions.tsx`: global overlays and fixed account/contact actions.

## Conventions
- Keep shared game design consistent, but preserve mode-specific image and gameplay requirements.
- Multiplayer create/join and waiting-lobby chrome should match `components/multiplayer-quiz-lobby.tsx`: shared header sizing, `GameInfoMenu` before the status pill, no lobby code in the header, and a separate centered lobby-code strip with hidden code, reveal/hide, and copy controls.
- Public lobby visibility toggles should persist immediately on click; keep them separate from draft settings that require Apply Changes.
- Use lucide icons for controls and include accessible labels on icon-only buttons.
- Keep dropdown and overlay stacking behavior explicit; inspect parent overflow before changing z-index.
- Settings menus must use the shared `AppSelectMenu`, not native browser selects or copied menu implementations. This component is the exact app-wide Ability Blitz/Skin Champion Difficulty/Modifiers style: dark rounded trigger with padded chevron, amber open/focus state, labeled popup description, spacing between bordered option cards, and matching toggle/button controls. Menus must have no background/drop shadow and must expand fully without an internal scrollbar. Make adjacent toggles match the menu control height and card styling.
- Do not duplicate profile, friends, invite, or autocomplete behavior when a shared helper/component can own it.
- Timed game displays should default to the Category Clash timer treatment: amber/yellow normally, red and pulsing during the urgent window, and one `timer-countdown` UI sound per displayed urgent second. Prefer a 10-second urgent window for new timers unless the game's established rules differ.
- Avoid broad rewrites of large game components during a narrow UI fix.
- When a component exceeds a reasonable ownership boundary, extract pure helpers or focused subcomponents without changing behavior.

## Verification
- Run `npm run check` after component changes.
- Do not run `npm run build` while the dev server is active.
