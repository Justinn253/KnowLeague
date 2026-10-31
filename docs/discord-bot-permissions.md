# KnowLeague Discord bot permissions

This is the production permission contract for the KnowLeague Discord bot. Grant the permissions below to the bot role only in the server and channels where it operates. Do not grant **Administrator**: the bot does not need it.

## Invite scopes

Create or re-authorize the bot with these OAuth2 scopes:

| Scope | Why it is required |
| --- | --- |
| `bot` | Adds the bot user to the server. |
| `applications.commands` | Registers and serves KnowLeague's guild slash commands. |

## Standard production bot role — select all eight

For the full current KnowLeague product, select these exact eight permissions in **OAuth2 > URL Generator** and grant them to the bot role in every configured KnowLeague channel. This is the recommended production grant; it covers Collections, leveling, Fishing, Mining, Woodcutting, league captures, and `/steal-emoji` without granting Administrator.

| # | Permission | Product behavior |
| --- | --- | --- |
| 1 | **View Channels** | Lets the bot receive interactions/messages and access configured command, drop, notification, and result channels. |
| 2 | **Send Messages** | Sends slash-command responses, automated skin/item/rune drops, game notifications, and scheduled panels. |
| 3 | **Embed Links** | Renders Collection panels, game panels, leaderboards, and command results. |
| 4 | **Attach Files** | Uploads Collection artwork and League catalogue captures to Discord's CDN. |
| 5 | **Read Message History** | Fetches claim reactions and partial messages, supports `/snipe`, and reads a selected source message for `/steal-emoji`. |
| 6 | **Manage Messages** | Clears stale reactions before a claimed-drop Gamble panel becomes a new claimable drop. Without it, the bot safely cancels that gamble before it can consume the skin. |
| 7 | **Manage Roles** | Applies/removes chat, Fishing, and Mining level rewards plus Chat/Fishing/Mining top-player roles. The bot role must be above every role it manages. |
| 8 | **Create Expressions** | Lets server administrators use `/steal-emoji` to import custom emoji. The server must have an available emoji slot. |

**Manage Expressions** is an acceptable alternative to **Create Expressions** for `/steal-emoji`; grant one of them, not both. The command itself accepts either permission.

## Conditional additions and constraints

| Permission or setting | When it is needed | Important constraints |
| --- | --- | --- |
| **Send Messages in Threads** | A configured command, drop, notification, or result channel is a thread. | Grant it in that thread’s parent/channel context. Private threads also need an applicable **View Channel** override. |
| Role hierarchy | **Manage Roles** is selected. | The KnowLeague role cannot manage roles at or above itself, managed/integration roles, or the server owner. |

## Permissions users need

Members need **Use Application Commands** in a channel to run slash commands there. This is a member/role channel permission, not a permission that needs to be granted to the bot. They also need access to the channel itself to see its public drops and panels.

## Gateway intents

Gateway intents are configured in the Discord Developer Portal under **Bot > Privileged Gateway Intents**, not in the invite permission list.

| Intent | Portal action | Why KnowLeague uses it |
| --- | --- | --- |
| **Server Members Intent** (`GuildMembers`) | Enable | Releases a departing, kicked, or banned member's Collection entries so they become claimable again. |
| **Message Content Intent** (`MessageContent`) | Enable | Supports the bounded `/snipe` cache, administrator `/steal-emoji` source parsing, and validated DISBOARD bump confirmations. |
| Guilds, Guild Messages, Guild Message Reactions, Guild Moderation, Guild Voice States | No privileged-toggle action | Receives slash/guild context, grants chat XP and automatic drops, processes reaction claims, clears banned-member XP, and awards voice XP. The bot never joins or listens to voice audio. |
| Presence Intent | Leave disabled | KnowLeague does not use member presence data. |

## Not required

Do **not** add these solely for KnowLeague: **Administrator**, **View Audit Log**, **Manage Server**, **Manage Channels**, **Manage Webhooks**, **Manage Events**, **Moderate Members**, **Add Reactions**, **Use External Emojis**, **Mention Everyone**, **Connect**, or **Speak**. The bot also does not need the Presence Intent.

## Recommended configuration checklist

1. Invite/re-authorize with `bot` and `applications.commands`.
2. Select and grant all **eight** permissions in the standard production table in every configured KnowLeague channel. Substitute **Manage Expressions** for **Create Expressions** only if preferred.
3. Place the bot role above every role it is allowed to manage for level rewards or top-player roles.
4. Add **Send Messages in Threads** only when a configured KnowLeague channel is a thread.
5. Enable **Server Members Intent** and **Message Content Intent** in the Developer Portal; keep Presence disabled.
6. Re-authorize the bot after changing invite permissions. A bot deployment is not needed for a Discord role or portal-intent change, although changed code still needs its normal bot deployment.
