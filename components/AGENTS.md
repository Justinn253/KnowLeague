# Component Guidance

## Scope
- Components are client-heavy React/TypeScript views styled with Tailwind.
- Large game files own significant local state. Read targeted ranges with `rg` before opening an entire file.

## Ownership
- `ability-blitz.tsx`: Ability Blitz gameplay, difficulty, modifiers, progress, and animations.
- `skin-champion.tsx`: Skin Champion gameplay and skin-image behavior.
- `skindle.tsx`: Daily Skindle guesses, reveal flow, and global statistics UI.
- `skincognito.tsx`: Multiplayer lobby/game UI, Realtime refreshes, chat, and lifecycle requests.
- `profile-screen.tsx` and `public-profile-screen.tsx`: owner/public profile presentations.
- `friends-widget.tsx`: friend list, direct messages, presence, and game invites.
- `global-actions.tsx`: global overlays and fixed account/contact actions.

## Conventions
- Keep shared game design consistent, but preserve mode-specific image and gameplay requirements.
- Use lucide icons for controls and include accessible labels on icon-only buttons.
- Keep dropdown and overlay stacking behavior explicit; inspect parent overflow before changing z-index.
- Do not duplicate profile, friends, invite, or autocomplete behavior when a shared helper/component can own it.
- Avoid broad rewrites of large game components during a narrow UI fix.
- When a component exceeds a reasonable ownership boundary, extract pure helpers or focused subcomponents without changing behavior.

## Verification
- Run `npm run check` after component changes.
- Do not run `npm run build` while the dev server is active.
