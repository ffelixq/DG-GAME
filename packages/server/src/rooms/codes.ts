import { customAlphabet } from 'nanoid';
import { asRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, type RoomCode } from '@lcc/shared';

const gen = customAlphabet(ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH);

/** Generate a room code not present in `taken`. */
export function generateRoomCode(taken: (code: RoomCode) => boolean): RoomCode {
  for (let attempt = 0; attempt < 50; attempt++) {
    const code = asRoomCode(gen());
    if (!taken(code)) return code;
  }
  throw new Error('could not allocate a unique room code');
}
