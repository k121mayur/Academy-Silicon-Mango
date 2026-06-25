/**
 * Floating WhatsApp contact button for the public landing page.
 *
 * Opens a direct chat with the Silicon Mango number, prefilled with a default
 * message. Kept self-contained (inline SVG, no external icon host) so it works
 * even behind a strict CDN/CSP.
 */

// Contact number in international form, digits only (wa.me requirement).
const WHATSAPP_NUMBER = "918446359728";
const DEFAULT_MESSAGE = "Hi Silicon Mango, I'd like to know more about your courses.";

export function FloatingWhatsApp() {
  const href = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(DEFAULT_MESSAGE)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat with us on WhatsApp"
      // Perfect circle on mobile (icon only); a balanced pill once the label
      // shows on sm+. Symmetric padding keeps the icon centred with breathing
      // room so the logo never looks squished.
      className="fixed bottom-5 right-5 z-50 inline-flex items-center justify-center gap-2.5 rounded-full bg-[#25D366] text-white shadow-card-hover ring-1 ring-black/5 p-3.5 sm:py-3 sm:pl-3.5 sm:pr-5 transition-transform duration-200 ease-out hover:scale-105 active:scale-95"
    >
      <svg
        viewBox="0 0 24 24"
        width={26}
        height={26}
        fill="currentColor"
        aria-hidden
        className="shrink-0"
      >
        <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.728-.979a9.864 9.864 0 001.749.372zm5.49-12.27c-.247-.55-.508-.561-.743-.57l-.633-.008c-.22 0-.578.083-.88.413-.302.33-1.154 1.127-1.154 2.75 0 1.623 1.182 3.19 1.346 3.41.165.22 2.281 3.654 5.633 4.985 2.785 1.106 3.352.886 3.957.83.605-.055 1.952-.798 2.227-1.568.275-.77.275-1.43.192-1.568-.082-.137-.302-.22-.633-.385-.33-.165-1.953-.964-2.255-1.074-.302-.11-.522-.165-.742.166-.22.33-.852 1.073-1.044 1.293-.192.22-.385.248-.715.083-.33-.166-1.394-.514-2.656-1.64-.982-.876-1.644-1.958-1.836-2.289-.193-.33-.02-.508.145-.673.148-.147.33-.385.495-.577.166-.193.22-.33.33-.55.11-.22.055-.413-.028-.578-.082-.165-.724-1.797-.972-2.345z" />
      </svg>
      <span className="hidden sm:inline font-semibold text-body-sm whitespace-nowrap">Chat with us</span>
    </a>
  );
}
