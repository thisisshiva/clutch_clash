import { supabase } from './supabaseClient.js';
import { authService } from './authService.js';

/**
 * Friends system backed by two Supabase tables:
 *   profiles(id uuid pk, username text unique)
 *   friendships(id, requester uuid, addressee uuid, status 'pending'|'accepted')
 * See supabase/schema.sql for setup.
 */
class FriendsService {
  /** Search profiles by username prefix (excluding self). */
  async search(query) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username')
      .ilike('username', `${query}%`)
      .neq('id', authService.user.id)
      .limit(10);
    if (error) throw new Error(error.message);
    return data;
  }

  async sendRequest(toUserId) {
    const { error } = await supabase.from('friendships').insert({
      requester: authService.user.id,
      addressee: toUserId,
      status: 'pending',
    });
    if (error) {
      throw new Error(error.code === '23505' ? 'Request already bheji hui hai' : error.message);
    }
  }

  async acceptRequest(friendshipId) {
    const { error } = await supabase
      .from('friendships')
      .update({ status: 'accepted' })
      .eq('id', friendshipId);
    if (error) throw new Error(error.message);
  }

  async removeFriendship(friendshipId) {
    const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
    if (error) throw new Error(error.message);
  }

  /**
   * @returns {Promise<{friends: Array, incoming: Array, outgoing: Array}>}
   * each item: { friendshipId, userId, username }
   */
  async getAll() {
    const myId = authService.user.id;
    const { data, error } = await supabase
      .from('friendships')
      .select(`
        id, status, requester, addressee,
        requesterProfile:profiles!friendships_requester_fkey(id, username),
        addresseeProfile:profiles!friendships_addressee_fkey(id, username)
      `)
      .or(`requester.eq.${myId},addressee.eq.${myId}`);
    if (error) throw new Error(error.message);

    const friends = [];
    const incoming = [];
    const outgoing = [];
    for (const row of data) {
      const otherProfile = row.requester === myId ? row.addresseeProfile : row.requesterProfile;
      const item = {
        friendshipId: row.id,
        userId: otherProfile?.id,
        username: otherProfile?.username || 'Unknown',
      };
      if (row.status === 'accepted') friends.push(item);
      else if (row.addressee === myId) incoming.push(item);
      else outgoing.push(item);
    }
    return { friends, incoming, outgoing };
  }
}

export const friendsService = new FriendsService();
