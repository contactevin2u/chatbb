import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface UIState {
  sidebarCollapsed: boolean;
  conversationListCollapsed: boolean;
  contactPanelOpen: boolean;
  commandPaletteOpen: boolean;
  shortcutsHelpOpen: boolean;
  activeModal: string | null;
  mobileMenuOpen: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleConversationList: () => void;
  setConversationListCollapsed: (collapsed: boolean) => void;
  toggleContactPanel: () => void;
  setContactPanelOpen: (open: boolean) => void;
  openModal: (modalId: string) => void;
  closeModal: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  openShortcutsHelp: () => void;
  closeShortcutsHelp: () => void;
  toggleMobileMenu: () => void;
  setMobileMenuOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      conversationListCollapsed: false,
      contactPanelOpen: true,
      commandPaletteOpen: false,
      shortcutsHelpOpen: false,
      activeModal: null,
      mobileMenuOpen: false,

      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      toggleConversationList: () =>
        set((state) => ({ conversationListCollapsed: !state.conversationListCollapsed })),
      setConversationListCollapsed: (collapsed) => set({ conversationListCollapsed: collapsed }),
      toggleContactPanel: () =>
        set((state) => ({ contactPanelOpen: !state.contactPanelOpen })),
      setContactPanelOpen: (open) => set({ contactPanelOpen: open }),
      openModal: (modalId) => set({ activeModal: modalId }),
      closeModal: () => set({ activeModal: null }),
      openCommandPalette: () => set({ commandPaletteOpen: true }),
      closeCommandPalette: () => set({ commandPaletteOpen: false }),
      toggleCommandPalette: () =>
        set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      openShortcutsHelp: () => set({ shortcutsHelpOpen: true }),
      closeShortcutsHelp: () => set({ shortcutsHelpOpen: false }),
      toggleMobileMenu: () =>
        set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen })),
      setMobileMenuOpen: (open) => set({ mobileMenuOpen: open }),
    }),
    {
      name: 'chatbaby-ui-preferences',
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        conversationListCollapsed: state.conversationListCollapsed,
        contactPanelOpen: state.contactPanelOpen,
      }),
    }
  )
);
