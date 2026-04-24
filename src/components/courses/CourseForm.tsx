"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CoverUpload } from "@/components/courses/CoverUpload";
import {
  createCourseAction,
  updateCourseAction,
} from "@/server/courses";

type CourseShape = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  priceType: string;
  priceLabel: string | null;
  stripePriceId: string | null;
  priceAmount: number | null;
  currency: string;
  published: boolean;
};

type Props =
  | { mode: "create"; groupId: string }
  | { mode: "edit"; groupId: string; course: CourseShape };

export function CourseForm(props: Props) {
  const isEdit = props.mode === "edit";
  const c = isEdit ? props.course : null;
  const action = isEdit ? updateCourseAction : createCourseAction;

  const [priceType, setPriceType] = useState(c?.priceType ?? "FREE");

  // Convert cents → dollars for display.
  const defaultPriceDollars =
    c?.priceAmount != null ? (c.priceAmount / 100).toFixed(2) : "";

  return (
    <form action={action} className="space-y-5">
      {isEdit ? <input type="hidden" name="courseId" value={c!.id} /> : null}
      {!isEdit ? <input type="hidden" name="groupId" value={props.groupId} /> : null}

      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          name="title"
          required
          minLength={2}
          maxLength={120}
          defaultValue={c?.title ?? ""}
          placeholder="Getting started with…"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          name="description"
          maxLength={2000}
          rows={4}
          defaultValue={c?.description ?? ""}
          placeholder="What will learners walk away with?"
        />
      </div>

      <CoverUpload name="coverUrl" defaultValue={c?.coverUrl} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="priceType">Price type</Label>
          <select
            id="priceType"
            name="priceType"
            value={priceType}
            onChange={(e) => setPriceType(e.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="FREE">Free</option>
            <option value="PAID">Paid</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="priceLabel">Price label (optional)</Label>
          <Input
            id="priceLabel"
            name="priceLabel"
            maxLength={40}
            defaultValue={c?.priceLabel ?? ""}
            placeholder="$29 one-time"
          />
        </div>
      </div>

      {priceType === "PAID" ? (
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-border bg-muted/30 p-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="priceDollars">Price (USD)</Label>
            <Input
              id="priceDollars"
              name="priceDollars"
              type="number"
              step="0.01"
              min="0"
              defaultValue={defaultPriceDollars}
              placeholder="29.00"
            />
            <p className="text-[11px] text-muted-foreground">
              Enter dollar amount (e.g. 29.00 = $29). Stored as cents internally.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="stripePriceId">Stripe Price ID (optional)</Label>
            <Input
              id="stripePriceId"
              name="stripePriceId"
              defaultValue={c?.stripePriceId ?? ""}
              placeholder="price_1ABC…"
            />
            <p className="text-[11px] text-muted-foreground">
              If set, this Stripe Price ID is used directly. Otherwise an ad-hoc price is created.
            </p>
          </div>
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="published"
          defaultChecked={c?.published ?? false}
          className="h-4 w-4"
        />
        Publish (visible to all members)
      </label>

      <div className="flex items-center gap-2">
        <Button type="submit">{isEdit ? "Save changes" : "Create course"}</Button>
      </div>
    </form>
  );
}
