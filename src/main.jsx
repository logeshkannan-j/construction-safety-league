import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";

// The boundary is OUTSIDE StrictMode so it also catches a throw from the
// second, StrictMode-only render pass. Without it a render error shows
// the user a completely black page and says nothing at all.
ReactDOM.createRoot(document.getElementById("root")).render(
  <ErrorBoundary>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </ErrorBoundary>
);
