declare module "create-torrent" {
  interface CreateTorrentOptions {
    name?: string;
    comment?: string;
    createdBy?: string;
    announceList?: string[][];
    private?: boolean;
    pieceLength?: number;
  }

  function createTorrent(
    input: string | Buffer,
    opts: CreateTorrentOptions,
    callback: (err: Error | null, torrent: Buffer) => void,
  ): void;

  export = createTorrent;
}

declare module "parse-torrent" {
  interface Instance {
    infoHash?: string;
    name?: string;
    announce?: string[];
  }

  function parseTorrent(torrentId: string | Buffer | Uint8Array): Promise<Instance>;
  export function toMagnetURI(parsed: Instance): string;
  export default parseTorrent;
}
