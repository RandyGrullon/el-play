import { useLocation, useNavigate } from 'react-router-dom';
import { canGoBack } from '../lib/swipeBack';

/** Volver a donde se estaba (o a `fallback` si se llegó por un enlace); deslizar a la derecha hace lo mismo */
export const useBack = (fallback: string) => {
    const navigate = useNavigate();
    const location = useLocation();
    return () => (canGoBack(location.key, window.history.state) ? navigate(-1) : navigate(fallback, { replace: true }));
};
