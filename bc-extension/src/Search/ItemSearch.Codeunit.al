namespace VOICE2ERP.Search;

using Microsoft.Inventory.Item;


codeunit 50100 "Item Search"
{
    procedure SearchItems(SearchText: Text[250]): Text
    var
        Item: Record Item;
        Response: JsonObject;
        Items: JsonArray;
        ItemJson: JsonObject;
        ResultText: Text;
        ResultCount: Integer;
        MaxResults: Integer;
    begin
        SearchText := SearchText.Trim();
        MaxResults := 5;

        if SearchText = '' then begin
            Response.Add('status', 'invalid_query');
            Response.Add('query', SearchText);
            Response.Add('count', 0);
            Response.Add('items', Items);

            Response.WriteTo(ResultText);
            exit(ResultText);
        end;

        Item.SetLoadFields("No.", Description, "Description 2", "Base Unit of Measure", "Unit Price", Blocked);

        Item.Reset();
        Item.SetRange("No.", SearchText); // Exact match first
        if Item.FindFirst() then begin
            Clear(ItemJson);

            ItemJson.Add('number', Item."No.");
            ItemJson.Add('description', Item.Description);
            ItemJson.Add('description2', Item."Description 2");
            ItemJson.Add('unitPrice', Item."Unit Price");
            ItemJson.Add('uom', Item."Base Unit of Measure");
            ItemJson.Add('blocked', Item.Blocked);

            Items.Add(ItemJson);

            Response.Add('status', 'resolved');
            Response.Add('query', SearchText);
            Response.Add('count', 1);
            Response.Add('items', Items);

            Response.WriteTo(ResultText);
            exit(ResultText);
        end
        else begin
            Item.SetFilter(Description, '&&' + SearchText + '*'); // https://learn.microsoft.com/de-de/dynamics365/release-plan/2024wave2/smb/dynamics365-business-central/specify-use-full-text-search-indexes-table-fields
            if Item.FindSet() then
                repeat
                    Clear(ItemJson);

                    ItemJson.Add('number', Item."No.");
                    ItemJson.Add('description', Item.Description);
                    ItemJson.Add('description2', Item."Description 2");
                    ItemJson.Add('unitPrice', Item."Unit Price");
                    ItemJson.Add('uom', Item."Base Unit of Measure");
                    ItemJson.Add('blocked', Item.Blocked);

                    Items.Add(ItemJson);

                    ResultCount += 1;
                until (Item.Next() = 0) or (ResultCount >= MaxResults);
        end;

        case ResultCount of
            0:
                Response.Add('status', 'not_found');
            1:
                Response.Add('status', 'resolved');
            else
                Response.Add('status', 'ambiguous');
        end;

        Response.Add('query', SearchText);
        Response.Add('count', ResultCount);
        Response.Add('items', Items);

        Response.WriteTo(ResultText);

        exit(ResultText);
    end;
}
