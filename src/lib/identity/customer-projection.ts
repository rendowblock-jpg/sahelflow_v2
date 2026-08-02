import "server-only";

import type { Customer } from "@/types/domain";
import type { CustomerListItem } from "@/lib/data/extensions/customer-extensions";
import {
  assertTrustedAction,
  trustedActionAllowed,
} from "./authorization";
import type { TrustedActorContext } from "./trusted-actor";

export type CustomerFieldAccess = Readonly<{
  contact: boolean;
  financials: boolean;
}>;

export type ProjectedCustomer = Omit<
  Customer,
  | "name"
  | "phone"
  | "phone2"
  | "wilaya"
  | "commune"
  | "address"
  | "notes"
  | "totalSpent"
> & {
  name: string | null;
  phone: string | null;
  phone2: string | null;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  notes: string | null;
  totalSpent: number | null;
  fieldAccess: CustomerFieldAccess;
};

export type ProjectedCustomerListItem = Omit<
  CustomerListItem,
  | "name"
  | "phone"
  | "phone2"
  | "wilaya"
  | "commune"
  | "address"
  | "totalSpent"
> & {
  name: string | null;
  phone: string | null;
  phone2: string | null;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  totalSpent: number | null;
  fieldAccess: CustomerFieldAccess;
};

function canReadContact(actorContext: TrustedActorContext): boolean {
  assertTrustedAction(actorContext, "customers.read", {
    shopId: actorContext.shop.shopId,
  });
  return trustedActionAllowed(actorContext, "customers.contact.read", {
    shopId: actorContext.shop.shopId,
  });
}

function canReadFinancials(actorContext: TrustedActorContext): boolean {
  return trustedActionAllowed(actorContext, "orders.financials.read", {
    shopId: actorContext.shop.shopId,
  });
}

/** Remove storage-only identity indexes and project protected contact fields. */
export function projectCustomerForTrustedActor(
  actorContext: TrustedActorContext,
  customer: Customer,
): ProjectedCustomer {
  const contact = canReadContact(actorContext);
  const financials = canReadFinancials(actorContext);
  const source = customer as Customer & {
    phoneEnc?: unknown;
    nameBlindIndex?: unknown;
    deletedAt?: unknown;
  };
  const {
    phoneEnc: _phoneEnc,
    nameBlindIndex: _nameBlindIndex,
    deletedAt: _deletedAt,
    ...safe
  } = source;

  return Object.freeze({
    ...safe,
    name: contact ? customer.name : null,
    phone: contact ? customer.phone : null,
    phone2: contact ? customer.phone2 : null,
    wilaya: contact ? customer.wilaya : null,
    commune: contact ? customer.commune : null,
    address: contact ? customer.address : null,
    notes: contact ? customer.notes : null,
    totalSpent: financials ? customer.totalSpent : null,
    fieldAccess: Object.freeze({ contact, financials }),
  });
}

export function projectCustomersForTrustedActor(
  actorContext: TrustedActorContext,
  customers: readonly Customer[],
): ProjectedCustomer[] {
  return customers.map((customer) =>
    projectCustomerForTrustedActor(actorContext, customer),
  );
}

export function projectCustomerListItemForTrustedActor(
  actorContext: TrustedActorContext,
  customer: CustomerListItem,
): ProjectedCustomerListItem {
  const contact = canReadContact(actorContext);
  const financials = canReadFinancials(actorContext);
  return Object.freeze({
    ...customer,
    name: contact ? customer.name : null,
    phone: contact ? customer.phone : null,
    phone2: contact ? customer.phone2 : null,
    wilaya: contact ? customer.wilaya : null,
    commune: contact ? customer.commune : null,
    address: contact ? customer.address : null,
    totalSpent: financials ? customer.totalSpent : null,
    fieldAccess: Object.freeze({ contact, financials }),
  });
}
