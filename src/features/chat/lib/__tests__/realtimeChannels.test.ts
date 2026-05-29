/* Tests for removeChannelsByName: removes only the channels matching a given name
   (both the bare name and the `realtime:`-prefixed topic), leaving others untouched. */

import type { RealtimeChannel } from '@supabase/supabase-js';

import { removeChannelsByName } from '../realtimeChannels';

function makeChannel(topic: string): RealtimeChannel {
  return { topic } as unknown as RealtimeChannel;
}

describe('removeChannelsByName', () => {
  it('removes channels whose topic matches the realtime:-prefixed name', () => {
    const target = makeChannel('realtime:conv:123');
    const other = makeChannel('realtime:conv:456');
    const removeChannel = jest.fn();
    const client = {
      getChannels: () => [target, other],
      removeChannel,
    };

    removeChannelsByName(client, 'conv:123');

    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(removeChannel).toHaveBeenCalledWith(target);
  });

  it('matches the bare name as well (no prefix)', () => {
    const target = makeChannel('global-inbox:user-1');
    const removeChannel = jest.fn();
    const client = {
      getChannels: () => [target],
      removeChannel,
    };

    removeChannelsByName(client, 'global-inbox:user-1');

    expect(removeChannel).toHaveBeenCalledTimes(1);
    expect(removeChannel).toHaveBeenCalledWith(target);
  });

  it('removes every matching channel when duplicates were orphaned', () => {
    const dup1 = makeChannel('realtime:conv:123');
    const dup2 = makeChannel('realtime:conv:123');
    const other = makeChannel('realtime:global-inbox:user-1');
    const removeChannel = jest.fn();
    const client = {
      getChannels: () => [dup1, dup2, other],
      removeChannel,
    };

    removeChannelsByName(client, 'conv:123');

    expect(removeChannel).toHaveBeenCalledTimes(2);
    expect(removeChannel).toHaveBeenCalledWith(dup1);
    expect(removeChannel).toHaveBeenCalledWith(dup2);
    expect(removeChannel).not.toHaveBeenCalledWith(other);
  });

  it('does nothing when no channel matches', () => {
    const removeChannel = jest.fn();
    const client = {
      getChannels: () => [makeChannel('realtime:conv:999')],
      removeChannel,
    };

    removeChannelsByName(client, 'conv:123');

    expect(removeChannel).not.toHaveBeenCalled();
  });
});
