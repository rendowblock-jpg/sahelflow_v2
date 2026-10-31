import type { ServiceContext } from "@/lib/data/service-base";
import type { ShopContext } from "@/lib/shops/context";
import type { ConnectedEnvelope } from "../protocol";

export type RemoteCommandDevice = Readonly<{
  deviceId: string;
  memberId: string;
  revocationEpoch: number;
}>;

export type CommandHandlerInput = Readonly<{
  context: ServiceContext & { shop: ShopContext };
  envelope: ConnectedEnvelope;
  device: RemoteCommandDevice;
  payload: unknown;
}>;

/** Ids and numbers only: the phone owns every word it shows. */
export type CommandHandler = (input: CommandHandlerInput) => Promise<Readonly<Record<string, unknown>>>;
