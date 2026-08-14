import { Suspense } from "react";
import LoginForm from "@/components/login/LoginForm";

export default function LoginPage() {
  return (
    <main
      style={{
        maxWidth: 320,
        margin: "4rem auto",
        padding: "0 1.5rem",
        display: "flex",
        flexDirection: "column",
        gap: "1.5rem",
      }}
    >
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>promptperday</h1>
      {/* LoginForm reads the ?next= redirect target via useSearchParams,
          which the App Router requires to sit inside a Suspense boundary. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
