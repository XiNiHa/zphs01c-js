import { PacketLengthParser, SerialPort, SerialPortMock } from "serialport";

export class ZPHS01C {
  #port: SerialPort | SerialPortMock;
  #parser = new PacketLengthParser({
    delimiter: 0x16,
    packetOverhead: 3,
  });

  constructor(
    options: { portPath: string } | { port: SerialPort | SerialPortMock }
  ) {
    if ("portPath" in options) {
      this.#port = new SerialPort({
        path: options.portPath,
        baudRate: 9600,
      });
    } else {
      this.#port = options.port;
    }
    this.#port.pipe(this.#parser);
  }

  async ready() {
    if (this.#port.isOpen) return true;

    return new Promise((resolve, reject) => {
      this.#port.once("open", () => {
        resolve(true);
      });
      if (!this.#port.opening) this.#port.open(reject);
    });
  }

  async *stream(): AsyncGenerator<StreamData> {
    await this.ready();
    const closePromise = new Promise<undefined>((resolve) =>
      this.#port.once("close", () => resolve(undefined))
    );
    const errorPromise = new Promise<never>((_, reject) =>
      this.#port.once("error", reject)
    );
    this.#port.write(requestToBuffer({ type: "startStreaming" }));
    let result;
    while (
      (result = await Promise.race([
        new Promise<Buffer>((resolve) => this.#parser.once("data", resolve)),
        closePromise,
        errorPromise,
      ]))
    ) {
      yield {
        co2: (result[3] << 8) + result[4],
        voc: (result[5] << 8) + result[6],
        humidity: ((result[7] << 8) + result[8]) / 10,
        temperature: (((result[9] << 8) + result[10]) - 500) / 10,
        pm2_5: (result[11] << 8) + result[12],
        pm10: ((result[13] << 8) + result[14]) || undefined,
        pm1: ((result[15] << 8) + result[16]) || undefined,
      };
    }
  }
}

export interface StreamData {
  co2: number;
  voc: number;
  humidity: number;
  temperature: number;
  pm2_5: number;
  pm10: number | undefined;
  pm1: number | undefined;
}

type Request =
  | { type: "startStreaming" }
  | {
      type: "calibrateCO2";
      current: number;
    }
  | {
      type: "manageDustMeasurement";
      enable: boolean;
    };

function requestToBuffer(req: Request): Buffer {
  const HEAD = 0x11;

  const body = (() => {
    switch (req.type) {
      case "startStreaming":
        return [0x01, 0x00];
      case "calibrateCO2": {
        const trimmed = req.current % 0x10000;
        return [0x03, (trimmed & 0xff00) >> 8, trimmed & 0xff];
      }
      case "manageDustMeasurement":
        return [0x0c, req.enable ? 0x02 : 0x01, 0x1e];
    }
  })();
  return Buffer.from(withChecksum([HEAD, body.length, ...body]));
}

function withChecksum(arr: number[]): number[] {
  const checksum = ~arr.reduce((a, b) => a + b, 0) + 1;
  return [...arr, checksum];
}
