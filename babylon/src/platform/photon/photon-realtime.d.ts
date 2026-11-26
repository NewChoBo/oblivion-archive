declare module 'photon-realtime' {
  interface Actor {
    actorNr: number;
    setCustomProperty(key: string, value: string): void;
    getCustomPropertyOrElse(key: string, fallback: unknown): unknown;
  }
  class Client {
    constructor(protocol: number, appId: string, version: string);
    static State: { JoinedLobby: number; Disconnected: number; Error: number };
    onStateChange: (state: number) => void;
    onError: (code: number, message: string) => void;
    onOperationResponse: (code: number, message: string, operation: number) => void;
    onJoinRoom: () => void;
    onActorJoin: (actor: Actor) => void;
    onActorLeave: (actor: Actor) => void;
    onEvent: (code: number, data: unknown, sender: number) => void;
    connectToRegionMaster(region: string): boolean;
    disconnect(): void;
    myRoomActorsArray(): Actor[];
    myRoomMasterActorNr(): number;
    myActor(): Actor;
    myRoom(): { setIsOpen(open: boolean): void };
    createRoom(name: string, options: { maxPlayers: number; isVisible: boolean }): void;
    joinRoom(name: string): void;
    raiseEvent(code: number, data: string, options?: { targetActors: number[] }): void;
    setLogLevel(level: number): void;
  }
  const Photon: {
    ConnectionProtocol: { Wss: number };
    PhotonPeer: { setWebSocketImpl(impl: typeof WebSocket): void };
    LoadBalancing: { LoadBalancingClient: typeof Client };
  };
  export default Photon;
}
