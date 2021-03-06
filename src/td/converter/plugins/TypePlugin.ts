module td
{
    /**
     * A handler that converts all instances of [[LateResolvingType]] to their renderable equivalents.
     */
    export class TypePlugin extends ConverterPlugin
    {
        reflections:DeclarationReflection[] = [];


        /**
         * Create a new TypeHandler instance.
         *
         * @param converter  The converter this plugin should be attached to.
         */
        constructor(converter:Converter) {
            super(converter);
            converter.on(Converter.EVENT_RESOLVE, this.onResolve, this);
            converter.on(Converter.EVENT_RESOLVE_END, this.onResolveEnd, this);
        }


        /**
         * Triggered by the dispatcher for each reflection in the resolving phase.
         *
         * @param event  The event containing the reflection to resolve.
         */
        private onResolve(event:ResolveEvent) {
            var project = event.getProject();
            var reflection = <DeclarationReflection>event.reflection;

            resolveType(reflection, <ReferenceType>reflection.type);
            resolveType(reflection, <ReferenceType>reflection.inheritedFrom);
            resolveType(reflection, <ReferenceType>reflection.overwrites);
            resolveTypes(reflection, reflection.extendedTypes);
            resolveTypes(reflection, reflection.extendedBy);
            resolveTypes(reflection, reflection.implementedTypes);

            if (reflection.kindOf(ReflectionKind.ClassOrInterface)) {
                this.postpone(reflection);

                walk(reflection.implementedTypes, (target) => {
                    this.postpone(target);
                    if (!target.implementedBy) target.implementedBy = [];
                    target.implementedBy.push(new ReferenceType(reflection.name, ReferenceType.SYMBOL_ID_RESOLVED, reflection));
                });

                walk(reflection.extendedTypes, (target) => {
                    this.postpone(target);
                    if (!target.extendedBy) target.extendedBy = [];
                    target.extendedBy.push(new ReferenceType(reflection.name, ReferenceType.SYMBOL_ID_RESOLVED, reflection));
                });
            }

            function walk(types:Type[], callback:{(declaration:DeclarationReflection):void}) {
                if (!types) return;
                types.forEach((type:ReferenceType) => {
                    if (!(type instanceof ReferenceType)) return;
                    if (!type.reflection || !(type.reflection instanceof DeclarationReflection)) return;
                    callback(<DeclarationReflection>type.reflection);
                });
            }

            function resolveTypes(reflection:Reflection, types:Type[]) {
                if (!types) return;
                for (var i = 0, c = types.length; i < c; i++) {
                    resolveType(reflection, <ReferenceType>types[i]);
                }
            }

            function resolveType(reflection:Reflection, type:Type) {
                if (type instanceof ReferenceType) {
                    var referenceType:ReferenceType = <ReferenceType>type;
                    if (referenceType.symbolID == ReferenceType.SYMBOL_ID_RESOLVE_BY_NAME) {
                        referenceType.reflection = reflection.findReflectionByName(referenceType.name);
                    } else if (!referenceType.reflection && referenceType.symbolID != ReferenceType.SYMBOL_ID_RESOLVED) {
                        referenceType.reflection = project.reflections[project.symbolMapping[referenceType.symbolID]];
                    }

                    if (referenceType.typeArguments) {
                        referenceType.typeArguments.forEach((typeArgument:Type) => {
                            resolveType(reflection, typeArgument);
                        });
                    }
                } else if (type instanceof TupleType) {
                    var tupleType:TupleType = <TupleType>type;
                    for (var index = 0, count = tupleType.elements.length; index < count; index++) {
                        resolveType(reflection, tupleType.elements[index]);
                    }
                } else if (type instanceof UnionType) {
                    var unionType:UnionType = <UnionType>type;
                    for (var index = 0, count = unionType.types.length; index < count; index++) {
                        resolveType(reflection, unionType.types[index]);
                    }
                }
            }
        }


        private postpone(reflection:DeclarationReflection) {
            if (this.reflections.indexOf(reflection) == -1) {
                this.reflections.push(reflection);
            }
        }


        /**
         * Return the simplified type hierarchy for the given reflection.
         *
         * @TODO Type hierarchies for interfaces with multiple parent interfaces.
         *
         * @param reflection The reflection whose type hierarchy should be generated.
         * @returns The root of the generated type hierarchy.
         */
        private onResolveEnd(event:ConverterEvent) {
            this.reflections.forEach((reflection) => {
                if (reflection.implementedBy) {
                    reflection.implementedBy.sort((a:Type, b:Type):number => {
                        if (a['name'] == b['name']) return 0;
                        return a['name'] > b['name'] ? 1 : -1;
                    });
                }

                var root:IDeclarationHierarchy;
                var hierarchy:IDeclarationHierarchy;
                function push(types:Type[]) {
                    var level:IDeclarationHierarchy = {types:types};
                    if (hierarchy) {
                        hierarchy.next = level;
                        hierarchy = level;
                    } else {
                        root = hierarchy = level;
                    }
                }


                if (reflection.extendedTypes) {
                    push(reflection.extendedTypes);
                }

                push([new ReferenceType(reflection.name, ReferenceType.SYMBOL_ID_RESOLVED, reflection)]);
                hierarchy.isTarget = true;

                if (reflection.extendedBy) {
                    push(reflection.extendedBy);
                }

                reflection.typeHierarchy = root;
            });
        }
    }


    /**
     * Register this handler.
     */
    Converter.registerPlugin('type', TypePlugin);
}