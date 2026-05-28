import { Link } from "react-router-dom";
import { Card, CardBody } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export function NoBatchSelected() {
  return (
    <div className="max-w-3xl">
      <Card>
        <CardBody className="text-center py-10 space-y-3">
          <span className="icon text-[48px] text-ink-outline">groups_2</span>
          <p className="text-title-md font-semibold text-ink">No batch selected</p>
          <p className="text-body-sm text-ink-variant">
            Open <strong>Assigned Batches</strong> and click <em>Make current</em> on a batch to
            start working on it.
          </p>
          <Link to="/instructor/batches">
            <Button leftIcon="groups_2">Go to Assigned Batches</Button>
          </Link>
        </CardBody>
      </Card>
    </div>
  );
}
