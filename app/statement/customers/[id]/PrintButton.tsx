"use client";

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="px-4 py-2 text-sm bg-[#104e98] text-white rounded-lg hover:bg-[#0b3d7a]"
    >
      طباعة
    </button>
  );
}
