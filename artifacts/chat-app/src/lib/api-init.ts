import { setAuthTokenGetter } from "@workspace/api-client-react";

// Initialize the API client auth
setAuthTokenGetter(() => {
  return localStorage.getItem("token");
});
