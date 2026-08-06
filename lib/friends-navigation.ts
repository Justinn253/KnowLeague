export const OPEN_FRIEND_MESSAGES_EVENT = 'knowleague:open-friend-messages';

export function requestOpenFriendMessages(friendId: string) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(OPEN_FRIEND_MESSAGES_EVENT, {
    detail: { friendId },
  }));
}
