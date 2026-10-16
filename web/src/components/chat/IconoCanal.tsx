export function IconoCanal({ proveedor = "cloud_api" }: { proveedor?: string | null }) {
  const nombre = proveedor === "messenger" ? "Messenger" : proveedor === "api" ? "API" : "WhatsApp";
  return <span className="inline-flex shrink-0 items-center text-muted-foreground" role="img" aria-label={nombre} title={nombre}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      {proveedor === "api" ? <><path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18" /></>
        : proveedor === "messenger" ? <><path d="M12 3C6.5 3 2 6.8 2 11.6c0 2.7 1.4 5.1 3.6 6.7V22l3.4-1.9c1 .3 2 .5 3 .5 5.5 0 10-3.9 10-8.7S17.5 3 12 3Z" /><path d="m6 15 5-5 3 2 4-4-5 7-3-2-4 2Z" /></>
        : <><path d="M20.4 11.6a8.4 8.4 0 0 1-12.5 7.3L3 21l1.7-4.9a8.4 8.4 0 1 1 15.7-4.5Z" /><path d="M8 7c0 5 3 8 8 8l1-2-3-1-1 1c-1.5-.6-2.4-1.5-3-3l1-1-1-3-2 1Z" /></>}
    </svg>
  </span>;
}
