import {
  createContext,
  createEffect,
  createSignal,
  useContext,
  type Accessor,
  type ParentComponent,
} from "solid-js";

import AdminAuthDialog from "~/components/AdminAuthDialog";
import { useAdminWalletAuth } from "~/lib/hooks/useAdminWalletAuth";

type AdminAuthState = ReturnType<typeof useAdminWalletAuth>;

interface AdminAuthContextValue extends AdminAuthState {
  closeAuthDialog: () => void;
  isAuthDialogOpen: Accessor<boolean>;
  openAuthDialog: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextValue>();

export const AdminAuthProvider: ParentComponent = props => {
  const auth = useAdminWalletAuth();
  const [isAuthDialogOpen, setAuthDialogOpen] = createSignal(false);

  createEffect(() => {
    if (auth.profile()) {
      setAuthDialogOpen(false);
    }
  });

  const openAuthDialog = () => {
    auth.clearError();
    setAuthDialogOpen(true);
  };

  const closeAuthDialog = () => {
    setAuthDialogOpen(false);
  };

  const value: AdminAuthContextValue = {
    ...auth,
    closeAuthDialog,
    isAuthDialogOpen,
    openAuthDialog,
  };

  return (
    <AdminAuthContext.Provider value={value}>
      {props.children}
      <AdminAuthDialog
        open={isAuthDialogOpen()}
        pending={auth.pending()}
        onClose={closeAuthDialog}
        requestChallenge={auth.requestChallenge}
        completeConnection={auth.completeConnection}
      />
    </AdminAuthContext.Provider>
  );
};

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);

  if (!context) {
    throw new Error("useAdminAuth must be used within an AdminAuthProvider.");
  }

  return context;
}
