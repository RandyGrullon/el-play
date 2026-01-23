import { useEffect, useRef } from 'react';

interface AdBannerProps {
  slot: string;
  format?: 'auto' | 'rectangle' | 'vertical' | 'horizontal';
  style?: React.CSSProperties;
  className?: string;
}

const AdBanner = ({ 
  slot, 
  format = 'auto', 
  style = {}, 
  className = '' 
}: AdBannerProps) => {
  const adRef = useRef<HTMLModElement>(null);
  const isAdPushed = useRef(false);

  useEffect(() => {
    // Solo pushear el ad una vez
    if (adRef.current && !isAdPushed.current) {
      try {
        // @ts-ignore - adsbygoogle is loaded from external script
        (window.adsbygoogle = window.adsbygoogle || []).push({});
        isAdPushed.current = true;
      } catch (error) {
        console.error('Error loading AdSense:', error);
      }
    }
  }, []);

  return (
    <div 
      className={`ad-container ${className}`}
      style={{ 
        margin: '20px auto', 
        textAlign: 'center',
        maxWidth: '100%',
        overflow: 'hidden',
        ...style 
      }}
    >
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client="ca-pub-2992268512574081"
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
};

export default AdBanner;
