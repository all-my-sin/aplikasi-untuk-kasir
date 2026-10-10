import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';

export function NotFoundPage() {
  return (
    <EmptyState
      icon={SearchX}
      title="Page not found"
      description="The page you are looking for does not exist."
      action={
        <Button asChild variant="outline">
          <Link to="/">Go home</Link>
        </Button>
      }
    />
  );
}
