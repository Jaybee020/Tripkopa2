import {
  ServiceAuthError,
  ServiceError,
  ServiceNotFoundError,
  ServiceRateLimitError,
} from "./errors";

const PROVIDER = "onecap-providus";

type PartnerError = {
  status?: string;
  error_code?: string;
  message?: string;
  details?: unknown;
};

export type VirtualAccount = {
  account_number: string;
  account_name: string;
  bank_name: string;
};

export type CreateVirtualAccountInput = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  bvn: string;
};

export type CreateVirtualAccountResponse = {
  status: "success";
  message?: string;
  user?: Record<string, unknown>;
  virtual_account: VirtualAccount;
};

class OneCapPartnerService {
  private config() {
    const baseUrl = process.env.ONECAP_PARTNER_BASE_URL?.replace(/\/+$/, "");
    const apiKey = process.env.ONECAP_PARTNER_API_KEY;
    if (!baseUrl || !apiKey) {
      throw new ServiceAuthError(
        PROVIDER,
        new Error("Missing ONECAP_PARTNER_BASE_URL or ONECAP_PARTNER_API_KEY"),
      );
    }
    return { baseUrl, apiKey };
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
  ): Promise<T> {
    const { baseUrl, apiKey } = this.config();
    const timeout = AbortSignal.timeout(15_000);
    let response: Response;
    try {
      response = await fetch(`${baseUrl}${path}`, {
        ...init,
        signal: timeout,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-Api-Key": apiKey,
          ...init.headers,
        },
      });
    } catch (error) {
      throw new ServiceError(
        `[${PROVIDER}] gateway request failed`,
        PROVIDER,
        error,
      );
    }

    const body = (await response.json().catch(() => ({}))) as PartnerError & T;
    if (response.ok) return body as T;
    if (response.status === 401 || response.status === 403) {
      throw new ServiceAuthError(PROVIDER, body);
    }
    if (response.status === 404) {
      throw new ServiceNotFoundError(PROVIDER, path, body);
    }
    if (response.status === 429) {
      throw new ServiceRateLimitError(PROVIDER, undefined, body);
    }
    const error = new ServiceError(
      `[${PROVIDER}] ${body.message || body.error_code || `HTTP ${response.status}`}`,
      PROVIDER,
      body,
    );
    error.status = response.status >= 500 ? 502 : response.status;
    throw error;
  }

  createVirtualAccount(input: CreateVirtualAccountInput) {
    return this.request<CreateVirtualAccountResponse>(
      "/api/v1/partners/virtual-accounts/create/",
      { method: "POST", body: JSON.stringify(input) },
    );
  }

  listVirtualAccounts(search?: string, page = 1) {
    const query = new URLSearchParams({ page: String(page) });
    if (search) query.set("search", search);
    return this.request<unknown>(
      `/api/v1/partners/virtual-accounts/?${query.toString()}`,
    );
  }

  initiateCardDeposit(input: { email: string; amount: number }) {
    return this.request<unknown>("/api/v1/partners/deposits/initiate/", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listDeposits(queryInput: Record<string, string>) {
    const query = new URLSearchParams(queryInput);
    return this.request<unknown>(`/api/v1/partners/deposits/?${query}`);
  }

  getDeposit(reference: string) {
    return this.request<unknown>(
      `/api/v1/partners/deposits/${encodeURIComponent(reference)}/`,
    );
  }

  initiateWithdrawal(input: {
    email: string;
    amount: number;
    bank_code: string;
    account_number: string;
    narration?: string;
  }) {
    return this.request<unknown>("/api/v1/partners/withdrawals/", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  listWithdrawals(queryInput: Record<string, string>) {
    const query = new URLSearchParams(queryInput);
    return this.request<unknown>(
      `/api/v1/partners/withdrawals/list/?${query}`,
    );
  }

  getWithdrawal(reference: string) {
    return this.request<unknown>(
      `/api/v1/partners/withdrawals/${encodeURIComponent(reference)}/`,
    );
  }
}

export const onecap = new OneCapPartnerService();

