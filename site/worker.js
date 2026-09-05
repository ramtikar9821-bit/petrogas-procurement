// Single Worker entry point for Cloudflare's unified Workers-with-static-assets
// product, which doesn't support the old Pages Functions file-based routing
// (functions/**/*.js auto-mapped to routes). This manually dispatches each
// /api/* path to the same, unmodified handler functions that file convention
// used to wire up automatically. Anything that isn't /api/* never reaches
// here: Cloudflare serves it straight from the static assets directory first.
import { onRequestPost as setupPost } from "./functions/api/setup.js";
import { onRequestPost as loginPost } from "./functions/api/login.js";
import { onRequestPost as logoutPost } from "./functions/api/logout.js";
import { onRequestGet as meGet } from "./functions/api/me.js";
import { onRequestGet as configGet, onRequestPut as configPut } from "./functions/api/config.js";
import { onRequestGet as rolesGet, onRequestPost as rolesPost } from "./functions/api/roles.js";
import { onRequestGet as usersGet, onRequestPost as usersPost } from "./functions/api/users/index.js";
import { onRequestPatch as userPatch } from "./functions/api/users/[id].js";
import { onRequestGet as assignableUsersGet } from "./functions/api/users/assignable.js";
import { onRequestGet as vendorsGet, onRequestPost as vendorsPost } from "./functions/api/vendors/index.js";
import { onRequestGet as templatesGet, onRequestPost as templatesPost } from "./functions/api/templates/index.js";
import { onRequestPut as templatePut } from "./functions/api/templates/[id].js";
import { onRequestGet as contractsGet, onRequestPost as contractsPost } from "./functions/api/contracts/index.js";
import { onRequestPut as contractPut } from "./functions/api/contracts/[id].js";
import { onRequestGet as clarificationsGet, onRequestPost as clarificationsPost } from "./functions/api/clarifications/index.js";
import { onRequestPut as clarificationPut, onRequestDelete as clarificationDelete } from "./functions/api/clarifications/[id].js";
import { onRequestGet as exceptionsGet, onRequestPost as exceptionsPost } from "./functions/api/exceptions/index.js";
import { onRequestPut as exceptionPut, onRequestDelete as exceptionDelete } from "./functions/api/exceptions/[id].js";
import { onRequestGet as tendersGet, onRequestPost as tendersPost } from "./functions/api/tenders/index.js";
import { onRequestDelete as tenderDelete } from "./functions/api/tenders/tender.js";
import { onRequestPost as criteriaPost } from "./functions/api/tenders/criteria.js";
import { onRequestPost as biddersPost } from "./functions/api/tenders/bidders.js";
import { onRequestPut as bidderCompliancePut } from "./functions/api/tenders/bidderCompliance.js";
import { onRequestPut as bidderQhsePut } from "./functions/api/tenders/bidderQhse.js";
import { onRequestPut as bidderFinancialPut } from "./functions/api/tenders/bidderFinancial.js";
import { onRequestPut as bidderIcvPut } from "./functions/api/tenders/bidderIcv.js";
import { onRequestGet as validityEntriesGet, onRequestPost as validityEntriesPost } from "./functions/api/validityEntries/index.js";
import { onRequestDelete as validityEntryDelete } from "./functions/api/validityEntries/[id].js";

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    const method = request.method;
    const base = { request, env, ctx };

    try {
      if (pathname === "/api/setup" && method === "POST") return setupPost(base);
      if (pathname === "/api/login" && method === "POST") return loginPost(base);
      if (pathname === "/api/logout" && method === "POST") return logoutPost(base);
      if (pathname === "/api/me" && method === "GET") return meGet(base);
      if (pathname === "/api/config" && method === "GET") return configGet(base);
      if (pathname === "/api/config" && method === "PUT") return configPut(base);
      if (pathname === "/api/roles" && method === "GET") return rolesGet(base);
      if (pathname === "/api/roles" && method === "POST") return rolesPost(base);

      if (pathname === "/api/users" && method === "GET") return usersGet(base);
      if (pathname === "/api/users" && method === "POST") return usersPost(base);
      if (pathname === "/api/users/assignable" && method === "GET") return assignableUsersGet(base);
      const userMatch = pathname.match(/^\/api\/users\/([^/]+)$/);
      if (userMatch && method === "PATCH") return userPatch({ ...base, params: { id: userMatch[1] } });

      if (pathname === "/api/vendors" && method === "GET") return vendorsGet(base);
      if (pathname === "/api/vendors" && method === "POST") return vendorsPost(base);

      if (pathname === "/api/clarifications" && method === "GET") return clarificationsGet(base);
      if (pathname === "/api/clarifications" && method === "POST") return clarificationsPost(base);
      const clarificationMatch = pathname.match(/^\/api\/clarifications\/([^/]+)$/);
      if (clarificationMatch && method === "PUT") return clarificationPut({ ...base, params: { id: clarificationMatch[1] } });
      if (clarificationMatch && method === "DELETE") return clarificationDelete({ ...base, params: { id: clarificationMatch[1] } });

      if (pathname === "/api/exceptions" && method === "GET") return exceptionsGet(base);
      if (pathname === "/api/exceptions" && method === "POST") return exceptionsPost(base);
      const exceptionMatch = pathname.match(/^\/api\/exceptions\/([^/]+)$/);
      if (exceptionMatch && method === "PUT") return exceptionPut({ ...base, params: { id: exceptionMatch[1] } });
      if (exceptionMatch && method === "DELETE") return exceptionDelete({ ...base, params: { id: exceptionMatch[1] } });

      if (pathname === "/api/templates" && method === "GET") return templatesGet(base);
      if (pathname === "/api/templates" && method === "POST") return templatesPost(base);
      const templateMatch = pathname.match(/^\/api\/templates\/([^/]+)$/);
      if (templateMatch && method === "PUT") return templatePut({ ...base, params: { id: templateMatch[1] } });

      if (pathname === "/api/contracts" && method === "GET") return contractsGet(base);
      if (pathname === "/api/contracts" && method === "POST") return contractsPost(base);
      const contractMatch = pathname.match(/^\/api\/contracts\/([^/]+)$/);
      if (contractMatch && method === "PUT") return contractPut({ ...base, params: { id: contractMatch[1] } });

      if (pathname === "/api/tenders" && method === "GET") return tendersGet(base);
      if (pathname === "/api/tenders" && method === "POST") return tendersPost(base);
      const tenderCriteriaMatch = pathname.match(/^\/api\/tenders\/([^/]+)\/criteria$/);
      if (tenderCriteriaMatch && method === "POST") return criteriaPost({ ...base, params: { tenderNumber: tenderCriteriaMatch[1] } });
      const tenderBiddersMatch = pathname.match(/^\/api\/tenders\/([^/]+)\/bidders$/);
      if (tenderBiddersMatch && method === "POST") return biddersPost({ ...base, params: { tenderNumber: tenderBiddersMatch[1] } });
      const bidderComplianceMatch = pathname.match(/^\/api\/tenders\/([^/]+)\/bidders\/([^/]+)\/compliance$/);
      if (bidderComplianceMatch && method === "PUT") return bidderCompliancePut({ ...base, params: { tenderNumber: bidderComplianceMatch[1], bidderId: bidderComplianceMatch[2] } });
      const bidderQhseMatch = pathname.match(/^\/api\/tenders\/([^/]+)\/bidders\/([^/]+)\/qhse$/);
      if (bidderQhseMatch && method === "PUT") return bidderQhsePut({ ...base, params: { tenderNumber: bidderQhseMatch[1], bidderId: bidderQhseMatch[2] } });
      const bidderFinancialMatch = pathname.match(/^\/api\/tenders\/([^/]+)\/bidders\/([^/]+)\/financial$/);
      if (bidderFinancialMatch && method === "PUT") return bidderFinancialPut({ ...base, params: { tenderNumber: bidderFinancialMatch[1], bidderId: bidderFinancialMatch[2] } });
      const bidderIcvMatch = pathname.match(/^\/api\/tenders\/([^/]+)\/bidders\/([^/]+)\/icv$/);
      if (bidderIcvMatch && method === "PUT") return bidderIcvPut({ ...base, params: { tenderNumber: bidderIcvMatch[1], bidderId: bidderIcvMatch[2] } });
      const tenderMatch = pathname.match(/^\/api\/tenders\/([^/]+)$/);
      if (tenderMatch && method === "DELETE") return tenderDelete({ ...base, params: { tenderNumber: tenderMatch[1] } });

      if (pathname === "/api/validityEntries" && method === "GET") return validityEntriesGet(base);
      if (pathname === "/api/validityEntries" && method === "POST") return validityEntriesPost(base);
      const validityEntryMatch = pathname.match(/^\/api\/validityEntries\/([^/]+)$/);
      if (validityEntryMatch && method === "DELETE") return validityEntryDelete({ ...base, params: { id: validityEntryMatch[1] } });

      return new Response("Not found", { status: 404 });
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }
};
