namespace VOICE2ERP.Search;

using Microsoft.Inventory.Item;

codeunit 50100 "Item Search"
{
    procedure SearchItems(SearchText: Text[250]): Text
    var
        Item: Record Item;
        Response: JsonObject;
        Items: JsonArray;
        ResultText: Text;
        MatchedSearchText: Text[250];
        ResultCount: Integer;
        MaxResults: Integer;
    begin
        SearchText := SearchText.Trim();
        MaxResults := 5;

        if SearchText = '' then begin
            BuildResponse(Response, Items, 'invalid_query', SearchText, SearchText, 0);

            Response.WriteTo(ResultText);
            exit(ResultText);
        end;

        // 1. Exact item number always wins.
        Item.SetLoadFields("No.", Description, "Description 2", "Base Unit of Measure", "Unit Price", Blocked);

        if Item.Get(SearchText) then begin
            AddItemToResult(Item, Items);

            BuildResponse(Response, Items, 'resolved', SearchText, SearchText, 1);

            Response.WriteTo(ResultText);
            exit(ResultText);
        end;

        // 2. Native Business Central text search.
        MatchedSearchText := SearchText;
        ResultCount := FindItems(MatchedSearchText, Items, MaxResults);

        // 3. Minimal voice normalization:
        //    whiteboards -> whiteboard
        if (ResultCount = 0) and EndsWithS(SearchText) then begin
            MatchedSearchText := CopyStr(SearchText, 1, StrLen(SearchText) - 1);

            ResultCount := FindItems(MatchedSearchText, Items, MaxResults);
        end;

        case ResultCount of
            0:
                BuildResponse(Response, Items, 'not_found', SearchText, MatchedSearchText, ResultCount);
            1:
                BuildResponse(Response, Items, 'resolved', SearchText, MatchedSearchText, ResultCount);
            else
                BuildResponse(Response, Items, 'ambiguous', SearchText, MatchedSearchText, ResultCount);
        end;

        Response.WriteTo(ResultText);
        exit(ResultText);
    end;

    local procedure FindItems(SearchText: Text[250]; var Items: JsonArray; MaxResults: Integer): Integer
    var
        Item: Record Item;
        ResultCount: Integer;
    begin
        Item.SetLoadFields("No.", Description, "Description 2", "Base Unit of Measure", "Unit Price", Blocked);

        Item.Reset();
        Item.SetFilter(Description, '&&' + SearchText + '*');
        if not Item.FindSet() then
            exit(0);

        repeat
            AddItemToResult(Item, Items);
            ResultCount += 1;
        until (Item.Next() = 0) or (ResultCount >= MaxResults);

        exit(ResultCount);
    end;

    local procedure AddItemToResult(Item: Record Item; var Items: JsonArray)
    var
        ItemJson: JsonObject;
    begin
        ItemJson.Add('number', Item."No.");
        ItemJson.Add('description', Item.Description);
        ItemJson.Add('description2', Item."Description 2");
        ItemJson.Add('unitPrice', Item."Unit Price");
        ItemJson.Add('uom', Item."Base Unit of Measure");
        ItemJson.Add('blocked', Item.Blocked);

        Items.Add(ItemJson);
    end;

    local procedure BuildResponse(var Response: JsonObject; Items: JsonArray; Status: Text; OriginalQuery: Text; MatchedQuery: Text; ResultCount: Integer)
    begin
        Response.Add('status', Status);
        Response.Add('query', OriginalQuery);
        Response.Add('matchedQuery', MatchedQuery);
        Response.Add('count', ResultCount);
        Response.Add('items', Items);
    end;

    local procedure EndsWithS(Value: Text): Boolean
    begin
        if StrLen(Value) <= 1 then
            exit(false);

        exit(LowerCase(CopyStr(Value, StrLen(Value), 1)) = 's');
    end;
}