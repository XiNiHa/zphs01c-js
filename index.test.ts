import { afterEach, beforeEach, expect, it } from "vitest";
import { SerialPortMock } from "serialport";
import { StreamData, ZPHS01C } from "./index.js";

beforeEach(() => {
  SerialPortMock.binding.createPort('dummy')
})

afterEach(() => {
  SerialPortMock.binding.reset()
})

it("initializes correctly", async () => {
  const port = new SerialPortMock({
    path: "dummy",
    baudRate: 9600,
  })
  await new ZPHS01C({ port }).ready()
});

it("parses data correctly", async () => {
  const port = new SerialPortMock({
    path: "dummy",
    baudRate: 9600,
  })
  const device = new ZPHS01C({ port })
  const buf: StreamData[] = []

  setTimeout(() => {
    port.port?.emitData(Buffer.from([0x16, 0x0b, 0x01, 0x01, 0x9a, 0x00, 0x67, 0x01, 0xea, 0x03, 0x04, 0x00, 0x36, 0x00, 0x3c, 0x00, 0x20, 0xb4]))
    setTimeout(() => {
      port.close()
    }, 500)
  }, 500)

  for await (const record of device.stream()) buf.push(record)

  expect(buf).toEqual([
    {
      co2: 410,
      voc: 0,
      ch2o: 103,
      humidity: 49,
      temperature: 27.2,
      pm2_5: 54,
      pm10: 60,
      pm1: 32,
    }
  ] satisfies StreamData[])
})
