function Sealed(): ClassDecorator {
  return () => undefined;
}

@Sealed()
export class DecoratedClass {}
