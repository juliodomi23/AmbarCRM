export default function Loading() {
  return <div className="space-y-6 p-4 md:p-6"><div className="skeleton h-8 w-44"/><div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0,1,2,3].map((i) => <div key={i} className="skeleton h-32"/>)}</div><div className="grid gap-4 lg:grid-cols-2"><div className="skeleton h-64"/><div className="skeleton h-64"/></div></div>;
}
