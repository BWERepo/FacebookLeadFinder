import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaCodeForm } from "@/components/search/AreaCodeForm";
import { StateCountyForm } from "@/components/search/StateCountyForm";
import { ZipRadiusForm } from "@/components/search/ZipRadiusForm";
import type { SearchCriteria } from "@/lib/search-criteria";

export function SearchModeTabs({
  busy,
  onSubmit,
  defaultMaxResults = 100,
}: {
  busy: boolean;
  onSubmit: (criteria: SearchCriteria) => void;
  /** The user's Settings default, used to seed each form's "Maximum results" field. */
  defaultMaxResults?: number;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <Tabs defaultValue="zip_radius">
          <TabsList className="mb-6 grid w-full grid-cols-3">
            <TabsTrigger value="zip_radius">ZIP code</TabsTrigger>
            <TabsTrigger value="area_code">Area code</TabsTrigger>
            <TabsTrigger value="state_county">State & county</TabsTrigger>
          </TabsList>
          <TabsContent value="zip_radius">
            <ZipRadiusForm busy={busy} onSubmit={onSubmit} defaultMaxResults={defaultMaxResults} />
          </TabsContent>
          <TabsContent value="area_code">
            <AreaCodeForm busy={busy} onSubmit={onSubmit} defaultMaxResults={defaultMaxResults} />
          </TabsContent>
          <TabsContent value="state_county">
            <StateCountyForm
              busy={busy}
              onSubmit={onSubmit}
              defaultMaxResults={defaultMaxResults}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
