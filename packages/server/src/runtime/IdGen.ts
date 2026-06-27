import { nanoid } from 'nanoid';
import {
  asChoiceId,
  asModifierId,
  asSeatId,
  asSessionId,
  asTokenId,
  type ChoiceId,
  type ItemInstanceId,
  type ModifierId,
  type SeatId,
  type SessionId,
  type TokenId,
} from '@lcc/shared';

// Server-side id minting. Injectable so tests can use deterministic sequential ids.
export interface IdGen {
  seat(): SeatId;
  token(): TokenId;
  session(): SessionId;
  modifier(): ModifierId;
  choice(): ChoiceId;
  itemInstance(): ItemInstanceId;
  generic(): string;
}

export class NanoIdGen implements IdGen {
  seat() {
    return asSeatId(nanoid(8));
  }
  token() {
    return asTokenId(nanoid(8));
  }
  session() {
    return asSessionId(nanoid(8));
  }
  modifier() {
    return asModifierId(nanoid(8));
  }
  choice() {
    return asChoiceId(nanoid(8));
  }
  itemInstance() {
    return nanoid(8) as unknown as ItemInstanceId;
  }
  generic() {
    return nanoid(8);
  }
}

export class SeqIdGen implements IdGen {
  private n = 0;
  private next(prefix: string) {
    this.n += 1;
    return `${prefix}${this.n}`;
  }
  seat() {
    return asSeatId(this.next('seat'));
  }
  token() {
    return asTokenId(this.next('tok'));
  }
  session() {
    return asSessionId(this.next('ses'));
  }
  modifier() {
    return asModifierId(this.next('mod'));
  }
  choice() {
    return asChoiceId(this.next('cho'));
  }
  itemInstance() {
    return this.next('itm') as unknown as ItemInstanceId;
  }
  generic() {
    return this.next('gen');
  }
}
