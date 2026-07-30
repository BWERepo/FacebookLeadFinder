import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AreaCodeForm } from "@/components/search/AreaCodeForm";
import { StateCountyForm } from "@/components/search/StateCountyForm";
import { ZipRadiusForm } from "@/components/search/ZipRadiusForm";
import type { SearchCriteria } from "@/lib/search-criteria";

export function SearchModeTabs({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (criteria: SearchCriteria) => void;
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
            <ZipRadiusForm busy={busy} onSubmit={onSubmit} />
          </TabsContent>
          <TabsContent value="area_code">
            <AreaCodeForm busy={busy} onSubmit={onSubmit} />
          </TabsContent>
          <TabsContent value="state_county">
            <StateCountyForm busy={busy} onSubmit={onSubmit} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
