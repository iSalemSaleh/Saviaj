// ============================================================
// Sibranet Technologies Ltd — Saviaj operator details.
//
// This file is the single source of truth for our company-side
// compliance identifiers. Update here, and the data flows
// automatically into the legal pages, settings dashboard, and
// any future invoice / receipt template.
//
// Anything that has not yet been issued (e.g. VAT number while
// we are below the registration threshold) is set to `null` so
// the UI can render an honest "not registered yet" state rather
// than an empty string.
// ============================================================

export interface CompanyInfo {
  legalName: string;
  tradingName: string;
  companyNumber: string;
  registeredOffice: {
    line1: string;
    city: string;
    postcode: string;
    country: string;
  };
  ico: {
    registrationNumber: string;
    registeredAt: string; // ISO date
  };
  // PHV / private hire operator licence. Even though Saviaj
  // operates as a marketplace, in some jurisdictions (e.g. TfL)
  // the platform itself is treated as a private hire operator
  // and must hold an operator's licence. Until the licence is
  // granted these fields are null and the booking layer falls
  // back to driver-only commercial status checks.
  phvOperatorLicence: {
    issuingAuthority: string | null;
    licenceNumber: string | null;
    expiresAt: string | null; // ISO date
  };
  // VAT registration. Sibranet is below the £90,000 threshold at
  // launch — when registered, populate `vatNumber` and
  // `registeredAt` and the receipt templates pick it up
  // automatically.
  vat: {
    vatNumber: string | null;
    registeredAt: string | null; // ISO date
  };
  // Data Protection Officer contact for ICO-compliant privacy
  // policy and any data subject access request.
  dpo: {
    name: string;
    email: string;
  };
}

export const SAVIAJ_COMPANY_INFO: CompanyInfo = {
  legalName: "Sibranet Technologies Ltd",
  tradingName: "Saviaj",
  companyNumber: "16953498",
  registeredOffice: {
    line1: "75 Beverley Road",
    city: "Bristol",
    postcode: "BS7 0JW",
    country: "United Kingdom",
  },
  ico: {
    registrationNumber: "ZC129989",
    registeredAt: "2026-04-21",
  },
  phvOperatorLicence: {
    issuingAuthority: null,
    licenceNumber: null,
    expiresAt: null,
  },
  vat: {
    vatNumber: null,
    registeredAt: null,
  },
  dpo: {
    name: "Saied Ibrahim",
    email: "ssibrahim247@gmail.com",
  },
};

// Helper: render a single-line postal address.
export function formatRegisteredAddress(info: CompanyInfo = SAVIAJ_COMPANY_INFO): string {
  const a = info.registeredOffice;
  return `${a.line1}, ${a.city} ${a.postcode}, ${a.country}`;
}
