import { useLocation, useNavigate } from 'react-router-dom';

/** Volver a donde se estaba (o a `fallback` si se llegó por un enlace) */
export const useBack = (fallback: string) => {
    const navigate = useNavigate();
    const location = useLocation();
    return () => (location.key !== 'default' ? navigate(-1) : navigate(fallback, { replace: true }));
};
