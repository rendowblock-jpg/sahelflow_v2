import { businessPrincipalFromTrustedActor } from "@/lib/business-truth/principal";
import { queuePhoneReply } from "@/lib/whatsapp/queue-phone-reply";
import { authorizeRemoteCommand } from "./common";
import type { CommandHandler } from "./types";

export const replyHandler: CommandHandler = async (input) => {
  const { context, envelope } = input;
  const actorContext = await authorizeRemoteCommand("command.messages.reply", input);
  return queuePhoneReply(
    { ...context, businessPrincipal: businessPrincipalFromTrustedActor(actorContext) },
    { clientMessageId: envelope.envelopeId, payload: input.payload },
  );
};
