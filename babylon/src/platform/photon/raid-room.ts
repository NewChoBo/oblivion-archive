import Photon from 'photon-realtime';
import {
  isDraft,
  isRaidRoster,
  applyPick,
  draftMembers,
  type DraftSeat,
  type RaidSeat,
} from '../../game/raid/raid-draft.ts';
import type { RaidCommandName } from '../../game/raid/raid-feature.ts';
import type { RaidHero } from '../../game/raid/raid-match.ts';

const Client = Photon.LoadBalancing.LoadBalancingClient;
// The npm distribution defaults to its Node ws adapter. Browsers use native WSS.
Photon.PhotonPeer.setWebSocketImpl(WebSocket);
// Replaying approved inputs requires every peer to use the same combat rules.
const version = 'oa-raid-12';
const event = { start: 10, intent: 11, frames: 12, pick: 13, draft: 14, syncDraft: 15 } as const;
export type RoomError = 'connectError' | 'roomUnavailable' | 'roomEnded' | 'syncError';
export type RaidEntry = 'host' | 'join' | 'quick';
interface Callbacks {
  lobby(seats: DraftSeat[], self: number, host: boolean): void;
  start(seats: RaidSeat[], self: number, host: boolean): void;
  intent(sender: number, data: unknown): void;
  frames(data: unknown): void;
  closed(reason: RoomError): void;
}
export class RaidRoom {
  readonly #client: InstanceType<typeof Client>;
  readonly #callbacks: Callbacks;
  #closed = false;
  #joined = false;
  #host = 0;
  #roster: RaidSeat[] = [];
  #draft: DraftSeat[] = [];
  #seq = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  constructor(appId: string, code: string, entry: RaidEntry, callbacks: Callbacks) {
    this.#callbacks = callbacks;
    const client = new Client(Photon.ConnectionProtocol.Wss, appId, version);
    this.#client = client;
    client.setLogLevel(0);
    client.onStateChange = (state) => {
      if (this.#closed) return;
      if (state === Client.State.JoinedLobby && !this.#joined) {
        if (entry === 'quick') {
          // Photon fills a public room or creates one atomically. Code rooms stay unlisted.
          if (
            !client.joinRandomOrCreateRoom({ expectedMaxPlayers: 4 }, '', {
              maxPlayers: 4,
              isVisible: true,
            })
          )
            this.fail('connectError');
        } else if (entry === 'host')
          client.createRoom('raid-' + code, { maxPlayers: 4, isVisible: false });
        else client.joinRoom('raid-' + code);
      } else if (state === Client.State.Disconnected || state === Client.State.Error)
        this.fail('connectError');
    };
    client.onJoinRoom = () => {
      if (this.#closed) return;
      this.#joined = true;
      clearTimeout(this.#timer);
      this.#lobby();
      if (this.self !== client.myRoomMasterActorNr())
        client.raiseEvent(event.syncDraft, 'null', {
          targetActors: [client.myRoomMasterActorNr()],
        });
    };
    client.onActorJoin = (actor) => {
      // A join already in flight can arrive while the master closes the room.
      if (
        this.host &&
        this.#roster.length &&
        !this.#roster.some((seat) => seat.actor === actor.actorNr)
      )
        client.raiseEvent(event.start, JSON.stringify(this.#roster), {
          targetActors: [actor.actorNr],
        });
      else this.#lobby();
    };
    client.onActorLeave = (actor) => {
      if (this.#roster.some((s) => s.actor === actor.actorNr)) this.fail('roomEnded');
      else this.#lobby();
    };
    client.onError = () => this.fail('connectError');
    client.onOperationResponse = (error, _msg, op) => {
      if (error && (op === 225 || op === 226 || op === 227)) this.fail('roomUnavailable');
    };
    client.onEvent = (code, raw, sender) => {
      if (
        this.#closed ||
        !this.#joined ||
        typeof raw !== 'string' ||
        raw.length > (code === event.intent ? 512 : 64000)
      )
        return;
      let data: unknown;
      try {
        data = JSON.parse(raw);
      } catch {
        return;
      }
      if (!this.#roster.length) {
        const master = client.myRoomMasterActorNr();
        if (this.self === master && (code === event.pick || code === event.syncDraft)) {
          if (code === event.pick) applyPick(this.#draft, sender, data);
          this.#lobby();
          return;
        }
        if (
          code === event.draft &&
          sender === master &&
          isDraft(data) &&
          data.some((s) => s.actor === this.self)
        ) {
          this.#draft = data;
          callbacks.lobby(data, this.self, false);
          return;
        }
      }
      if (code === event.start && !this.#roster.length && sender === client.myRoomMasterActorNr()) {
        if (
          !isRaidRoster(data) ||
          !data.some((s) => s.actor === this.self) ||
          !data.some((s) => s.actor === sender)
        )
          this.fail('roomUnavailable');
        else this.#begin(data, sender);
      } else if (this.#roster.length && code === event.intent && this.host)
        callbacks.intent(sender, data);
      else if (this.#roster.length && code === event.frames && sender === this.#host && !this.host)
        callbacks.frames(data);
    };
    this.#timer = setTimeout(() => this.fail('connectError'), 18000);
    if (!client.connectToRegionMaster('asia')) queueMicrotask(() => this.fail('connectError'));
  }
  get self() {
    return this.#client.myActor().actorNr;
  }
  get host() {
    return this.self === this.#host;
  }
  #members() {
    return draftMembers(
      this.#draft,
      this.#client.myRoomActorsArray().map((a) => a.actorNr),
    );
  }
  #lobby() {
    if (!this.#joined || this.#roster.length || this.#closed) return;
    const master = this.self === this.#client.myRoomMasterActorNr();
    this.#draft = this.#members();
    if (master) this.#client.raiseEvent(event.draft, JSON.stringify(this.#draft));
    this.#callbacks.lobby(this.#draft, this.self, master);
  }
  pick(hero: RaidHero | null) {
    if (!this.#joined || this.#roster.length || this.#closed) return;
    const master = this.#client.myRoomMasterActorNr();
    if (this.self === master) {
      applyPick(this.#draft, this.self, hero);
      this.#lobby();
    } else this.#client.raiseEvent(event.pick, JSON.stringify(hero), { targetActors: [master] });
  }
  start() {
    if (
      !this.#joined ||
      this.#closed ||
      this.#roster.length ||
      this.self !== this.#client.myRoomMasterActorNr()
    )
      return;
    const seats = this.#members();
    if (!isRaidRoster(seats)) return;
    this.#client.myRoom().setIsOpen(false);
    this.#client.raiseEvent(event.start, JSON.stringify(seats));
    this.#begin(seats, this.self);
  }
  #begin(roster: RaidSeat[], host: number) {
    this.#roster = roster;
    this.#host = host;
    this.#callbacks.start(roster, this.self, this.host);
  }
  order(action: RaidCommandName, payload?: unknown) {
    if (this.#closed || !this.#roster.length) return false;
    const data = { seq: ++this.#seq, action, payload };
    if (this.host) this.#callbacks.intent(this.self, data);
    else
      this.#client.raiseEvent(event.intent, JSON.stringify(data), { targetActors: [this.#host] });
    return true;
  }
  frames(batch: unknown) {
    if (this.host && !this.#closed) this.#client.raiseEvent(event.frames, JSON.stringify(batch));
  }
  fail(reason: RoomError) {
    if (this.#closed) return;
    this.close();
    this.#callbacks.closed(reason);
  }
  close() {
    if (this.#closed) return;
    this.#closed = true;
    clearTimeout(this.#timer);
    this.#client.disconnect();
  }
}
