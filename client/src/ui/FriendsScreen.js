import { el } from './dom.js';
import { friendsService } from '../auth/friendsService.js';

/**
 * Friends management: search + add, incoming/outgoing requests, friend list.
 * @param {{ onBack: () => void }} props
 */
export function FriendsScreen({ onBack }) {
  const error = el('div.error-msg');
  const friendsList = el('ul.friend-list');
  const incomingList = el('ul.friend-list');
  const outgoingList = el('ul.friend-list');
  const searchResults = el('ul.friend-list');
  const searchInput = el('input', {
    type: 'text', placeholder: 'Username se dhundo...',
    onkeydown: (e) => { if (e.key === 'Enter') search(); },
  });

  async function refresh() {
    error.textContent = '';
    try {
      const { friends, incoming, outgoing } = await friendsService.getAll();
      friendsList.replaceChildren(...(friends.length ? friends.map((f) =>
        el('li', {},
          el('span', {}, f.username),
          el('span.spacer'),
          el('button.btn.secondary.small', {
            onclick: () => act(() => friendsService.removeFriendship(f.friendshipId)),
          }, 'Remove'),
        )
      ) : [el('li', {}, el('span.hint', {}, 'Abhi koi friend nahi - upar se search karo!'))]));

      incomingList.replaceChildren(...incoming.map((f) =>
        el('li', {},
          el('span', {}, f.username),
          el('span.spacer'),
          el('button.btn.small', {
            onclick: () => act(() => friendsService.acceptRequest(f.friendshipId)),
          }, 'Accept'),
          el('button.btn.secondary.small', {
            onclick: () => act(() => friendsService.removeFriendship(f.friendshipId)),
          }, 'Reject'),
        )
      ));

      outgoingList.replaceChildren(...outgoing.map((f) =>
        el('li', {}, el('span', {}, f.username), el('span.spacer'), el('span.hint', {}, 'Pending...'))
      ));
    } catch (e) {
      error.textContent = e.message;
    }
  }

  async function act(fn) {
    try {
      await fn();
      await refresh();
    } catch (e) {
      error.textContent = e.message;
    }
  }

  async function search() {
    const q = searchInput.value.trim();
    if (q.length < 2) return;
    try {
      const users = await friendsService.search(q);
      searchResults.replaceChildren(...(users.length ? users.map((u) =>
        el('li', {},
          el('span', {}, u.username),
          el('span.spacer'),
          el('button.btn.small', {
            onclick: () => act(async () => {
              await friendsService.sendRequest(u.id);
              searchResults.replaceChildren();
              searchInput.value = '';
            }),
          }, 'Add'),
        )
      ) : [el('li', {}, el('span.hint', {}, 'Koi nahi mila is naam se'))]));
    } catch (e) {
      error.textContent = e.message;
    }
  }

  refresh();

  return el('div.screen', {},
    el('div.panel', { style: 'width:460px' },
      el('h2', {}, 'Friends'),
      el('div.row', {}, searchInput, el('button.btn.small', { onclick: search }, 'Search')),
      searchResults,
      error,
      el('h3', {}, 'Friend Requests'),
      incomingList,
      el('h3', {}, 'Sent Requests'),
      outgoingList,
      el('h3', {}, 'Mere Friends'),
      friendsList,
      el('button.btn.secondary', { style: 'margin-top:16px', onclick: onBack }, 'Back'),
    ),
  );
}
