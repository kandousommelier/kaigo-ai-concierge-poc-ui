import { FOOTER_BRAND_NAME, FOOTER_COPYRIGHT } from '@/constants';

type Props = {
  className?: string;
};

export const Footer = (props: Props) => {
  const { className } = props;

  return (
    <footer
      className={`flex flex-col items-center gap-y-1 p-6 text-std-16N-170 ${className ?? ''}`}
    >
      <p>{FOOTER_BRAND_NAME}</p>
      <p>{FOOTER_COPYRIGHT}</p>
    </footer>
  );
};
