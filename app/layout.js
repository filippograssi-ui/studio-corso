import "./globals.css";

export const metadata = { title: "Studio — modifica il tuo assistente a parole", description: "Scrivi cosa vuoi cambiare e Claude modifica il tuo sito." };
export const viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
